import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'

import type { Access } from '../access/guard'
import { createDelivery, type Delivery } from '../notes/delivery'
import { BoardTabs } from '../start'
import { createHub, type LiveHub } from './hub'

const SNAPSHOT: ListResult = { root: '/board', projects: [] }
const KEY = 'b'.repeat(64)
const TOKEN = 'a'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'

describe('createHub', () => {
  let server: Server
  let hub: LiveHub
  let tabs: BoardTabs
  let port: number
  let sockets: WebSocket[]
  let access: Access

  beforeEach(async () => {
    tabs = new BoardTabs()
    sockets = []
    access = {
      token: () => null,
      key: KEY,
      cookieName: COOKIE,
      isOwnOrigin: (host) => host === `127.0.0.1:${port}`,
    }
    server = createServer()
    hub = createHub({
      tabs,
      port: () => port,
      access,
      snapshot: async () => SNAPSHOT,
    })
    server.on('upgrade', (request, socket, head) =>
      hub.handleUpgrade(request, socket, head),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    for (const socket of sockets) socket.terminate()
    await hub.close()
    await new Promise((resolve) => server.close(resolve))
  })

  function connect({
    path = '/api/live',
    origin,
    cookie,
    bearer,
  }: {
    path?: string
    origin?: string
    cookie?: string
    bearer?: string
  } = {}): WebSocket {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, {
      headers: {
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
    })
    sockets.push(socket)
    return socket
  }

  function nextMessage(socket: WebSocket): Promise<ServerMessage> {
    return new Promise((resolve) =>
      socket.once('message', (data) => resolve(JSON.parse(String(data)))),
    )
  }

  /** Says hello and resolves with the board and the access message that follows it. */
  async function helloAsBoard(
    socket: WebSocket,
  ): Promise<{ board: ServerMessage; access: ServerMessage }> {
    await new Promise((resolve) => socket.once('open', resolve))
    const received: ServerMessage[] = []
    const both = new Promise<void>((resolve) =>
      socket.on('message', (data) => {
        received.push(JSON.parse(String(data)))
        if (received.length === 2) resolve()
      }),
    )
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await both
    const [board, access] = received as [ServerMessage, ServerMessage]
    return { board, access }
  }

  it('sends the board snapshot on a board hello', async () => {
    const { board } = await helloAsBoard(connect())

    expect(board).toEqual({ type: 'board', data: SNAPSHOT })
  })

  describe('access', () => {
    const own = () => `http://127.0.0.1:${port}`

    it('tells a tab holding the cookie and the board origin it may write', async () => {
      const socket = connect({ origin: own(), cookie: `${COOKIE}=${KEY}` })

      const { access: message } = await helloAsBoard(socket)

      expect(message).toEqual({ type: 'access', write: true })
      expect(tabs.writers).toBe(1)
    })

    it.each([
      ['no cookie', {}],
      ['a wrong key', { cookie: `${COOKIE}=${'c'.repeat(64)}` }],
    ])('tells a tab with %s it may only read', async (_case, extra) => {
      const socket = connect({ origin: own(), ...extra })

      const { access: message } = await helloAsBoard(socket)

      expect(message).toEqual({ type: 'access', write: false })
      expect(tabs.count).toBe(1)
      expect(tabs.writers).toBe(0)
    })

    it('stops counting a writer when its socket closes', async () => {
      const socket = connect({ origin: own(), cookie: `${COOKIE}=${KEY}` })
      await helloAsBoard(socket)

      socket.close()

      await expect.poll(() => tabs.writers).toBe(0)
    })
  })

  it('tells closeTab the id a board tab said hello with once it closes', async () => {
    const closed: string[] = []
    await hub.close()
    hub = createHub({
      tabs,
      port: () => port,
      access,
      snapshot: async () => SNAPSHOT,
      closeTab: (tab) => closed.push(tab),
    })
    const socket = connect()
    await new Promise((resolve) => socket.once('open', resolve))
    const board = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'hello', role: 'board', tab: 't-1' }))
    await board

    socket.close()

    await expect.poll(() => closed).toEqual(['t-1'])
  })

  it('sends the findings after the board when the hub holds them', async () => {
    const findings = { 'studio/home/hero': [] }
    const withFindings = createHub({
      tabs,
      port: () => port,
      access,
      snapshot: async () => SNAPSHOT,
      findings: async () => findings,
    })
    server.removeAllListeners('upgrade')
    server.on('upgrade', (request, socket, head) =>
      withFindings.handleUpgrade(request, socket, head),
    )
    const socket = connect()
    const received: ServerMessage[] = []
    socket.on('message', (data) => received.push(JSON.parse(String(data))))

    await helloAsBoard(socket)

    await expect
      .poll(() => received)
      .toEqual([
        { type: 'board', data: SNAPSHOT },
        { type: 'access', write: false },
        { type: 'findings', findings },
      ])
    await withFindings.close()
  })

  it('sends the live claims right after the history counts', async () => {
    const claims = [
      {
        frame: 'studio/home/hero',
        session: 'sess-a',
        agent: 'claude',
        tag: 'claude · studio',
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2026-10-19T10:05:00.000Z',
      },
    ]
    const withClaims = createHub({
      tabs,
      port: () => port,
      access,
      snapshot: async () => SNAPSHOT,
      history: () => ({ undo: 0, redo: 0 }),
      claims: async () => claims,
    })
    server.removeAllListeners('upgrade')
    server.on('upgrade', (request, socket, head) =>
      withClaims.handleUpgrade(request, socket, head),
    )
    const socket = connect()
    const received: ServerMessage[] = []
    socket.on('message', (data) => received.push(JSON.parse(String(data))))

    await helloAsBoard(socket)

    await expect
      .poll(() => received)
      .toEqual([
        { type: 'board', data: SNAPSHOT },
        { type: 'access', write: false },
        { type: 'history', undo: 0, redo: 0 },
        { type: 'claims', claims },
      ])
    await withClaims.close()
  })

  it('sends the history counts right after the access message', async () => {
    const withHistory = createHub({
      tabs,
      port: () => port,
      access,
      snapshot: async () => SNAPSHOT,
      history: () => ({ undo: 2, redo: 1 }),
    })
    server.removeAllListeners('upgrade')
    server.on('upgrade', (request, socket, head) =>
      withHistory.handleUpgrade(request, socket, head),
    )
    const socket = connect()
    const received: ServerMessage[] = []
    socket.on('message', (data) => received.push(JSON.parse(String(data))))

    await helloAsBoard(socket)

    await expect
      .poll(() => received)
      .toEqual([
        { type: 'board', data: SNAPSHOT },
        { type: 'access', write: false },
        { type: 'history', undo: 2, redo: 1 },
      ])
    await withHistory.close()
  })

  it('counts a board client as an open tab until it closes', async () => {
    const socket = connect()
    await helloAsBoard(socket)

    expect(tabs.count).toBe(1)

    socket.close()
    await expect.poll(() => tabs.count).toBe(0)
  })

  it('counts a hello of another role or a message that is not one as no tab', async () => {
    const socket = connect()
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'other' }))
    socket.send('not json')
    // Messages are handled in order, so once the board hello's snapshot
    // arrives the two before it have been read.
    const snapshot = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await snapshot

    expect(tabs.count).toBe(1)
  })

  it('broadcasts to every board client', async () => {
    const first = connect()
    const second = connect()
    await Promise.all([helloAsBoard(first), helloAsBoard(second)])

    const received = Promise.all([nextMessage(first), nextMessage(second)])
    hub.broadcast({ type: 'reload', refs: ['studio/home/hero'] })

    expect(await received).toEqual([
      { type: 'reload', refs: ['studio/home/hero'] },
      { type: 'reload', refs: ['studio/home/hero'] },
    ])
  })

  it.each([
    ['another path', { path: '/api/other' }],
    ['a foreign origin', { origin: 'http://evil.test' }],
  ])('refuses an upgrade on %s', async (_case, options) => {
    const socket = connect(options)

    const failed = await new Promise<boolean>((resolve) => {
      socket.once('open', () => resolve(false))
      socket.once('error', () => resolve(true))
    })

    expect(failed).toBe(true)
  })

  it('accepts the board page as the origin', async () => {
    const { board } = await helloAsBoard(
      connect({ origin: `http://localhost:${port}` }),
    )

    expect(board.type).toBe('board')
  })

  describe('inbox', () => {
    let delivery: Delivery
    let inboxHub: LiveHub
    let inboxServer: Server
    let inboxPort: number

    beforeEach(async () => {
      delivery = createDelivery({
        pending: async (session) => [
          {
            note: {
              id: 'n_00000001',
              number: 1,
              frame: 'hero',
              anchor: null,
              text: 'x',
              from: 'developer',
              author: null,
              session: null,
              to: session,
              state: 'queued',
              thread: null,
              createdAt: '2026-10-19T10:00:00.000Z',
              updatedAt: '2026-10-19T10:00:00.000Z',
            },
            ref: 'studio/home/hero',
            line: 'frameboard note n_00000001',
          },
        ],
        markDelivered: async () => {},
        onListeners: (listeners) =>
          inboxHub.broadcast({ type: 'listeners', listeners }),
        now: () => new Date('2026-10-19T10:00:00.000Z'),
      })
      inboxServer = createServer()
      inboxHub = createHub({
        tabs,
        port: () => inboxPort,
        access: { ...access, token: () => TOKEN },
        snapshot: async () => SNAPSHOT,
        notes: async () => ({ 'studio/home': [] }),
        delivery,
      })
      inboxServer.on('upgrade', (request, socket, head) =>
        inboxHub.handleUpgrade(request, socket, head),
      )
      await new Promise<void>((resolve) =>
        inboxServer.listen(0, '127.0.0.1', resolve),
      )
      inboxPort = (inboxServer.address() as AddressInfo).port
    })

    afterEach(async () => {
      for (const socket of sockets) socket.terminate()
      await inboxHub.close()
      await new Promise((resolve) => inboxServer.close(resolve))
    })

    function connectInbox(headers: Record<string, string>): WebSocket {
      const socket = new WebSocket(`ws://127.0.0.1:${inboxPort}/api/live`, {
        headers,
      })
      sockets.push(socket)
      return socket
    }

    async function helloAsInbox(socket: WebSocket): Promise<void> {
      await new Promise((resolve) => socket.once('open', resolve))
      socket.send(
        JSON.stringify({
          type: 'hello',
          role: 'inbox',
          session: 'sess-1',
          tag: 'claude · app',
        }),
      )
    }

    it('sends a queued note to an inbox upgraded with the bearer', async () => {
      const socket = connectInbox({ authorization: `Bearer ${TOKEN}` })
      const received = nextMessage(socket)

      await helloAsInbox(socket)

      expect(await received).toMatchObject({
        type: 'note',
        ref: 'studio/home/hero',
        line: 'frameboard note n_00000001',
      })
    })

    it('never counts an inbox as a board tab', async () => {
      const socket = connectInbox({ authorization: `Bearer ${TOKEN}` })
      const received = nextMessage(socket)
      await helloAsInbox(socket)
      await received

      expect(tabs.count).toBe(0)
    })

    it('closes an inbox hello with no bearer', async () => {
      const socket = connectInbox({})
      const closed = new Promise((resolve) => socket.once('close', resolve))

      await helloAsInbox(socket)

      expect(await closed).toBe(1008)
      expect(delivery.listeners()).toEqual([])
    })

    it("closes an inbox hello carrying the board's cookie and origin alone", async () => {
      const socket = connectInbox({
        origin: `http://127.0.0.1:${inboxPort}`,
        cookie: `${COOKIE}=${KEY}`,
      })
      const closed = new Promise((resolve) => socket.once('close', resolve))

      await helloAsInbox(socket)

      expect(await closed).toBe(1008)
    })

    it('sends a board client the notes and listeners after its access', async () => {
      const socket = connectInbox({})
      await new Promise((resolve) => socket.once('open', resolve))
      const received: ServerMessage[] = []
      const four = new Promise<void>((resolve) =>
        socket.on('message', (data) => {
          received.push(JSON.parse(String(data)))
          if (received.length === 4) resolve()
        }),
      )

      socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
      await four

      expect(received.slice(1).map((message) => message.type)).toEqual([
        'access',
        'notes',
        'listeners',
      ])
    })

    it('tells a board client a session started listening', async () => {
      const board = connectInbox({})
      await new Promise((resolve) => board.once('open', resolve))
      const listening = new Promise<ServerMessage>((resolve) =>
        board.on('message', (data) => {
          const message = JSON.parse(String(data)) as ServerMessage
          if (message.type === 'listeners' && message.listeners.length > 0) {
            resolve(message)
          }
        }),
      )
      board.send(JSON.stringify({ type: 'hello', role: 'board' }))
      await expect.poll(() => tabs.count).toBe(1)

      await helloAsInbox(connectInbox({ authorization: `Bearer ${TOKEN}` }))

      expect(await listening).toEqual({
        type: 'listeners',
        listeners: [
          {
            session: 'sess-1',
            tag: 'claude · app',
            since: '2026-10-19T10:00:00.000Z',
          },
        ],
      })
    })
  })
})
