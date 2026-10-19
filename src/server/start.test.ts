import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'

import { cli } from '../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { BoardTabs, type RunningServer, startServer } from './start'

describe('startServer', () => {
  let clientDir: string
  let root: string
  let servers: RunningServer[]

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-root-')))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
    servers = []
  })

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()))
    rmSync(clientDir, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  async function start(port: number, strictPort?: boolean) {
    const server = await startServer({
      clientDir,
      facesDir: clientDir,
      root,
      port,
      strictPort,
      openUrl: () => {},
    })
    servers.push(server)
    return server
  }

  it('binds loopback and reports the port it bound', async () => {
    const server = await start(0)

    expect(server.hostname).toBe('127.0.0.1')
    expect(server.port).toBeGreaterThan(0)

    const response = await fetch(`http://127.0.0.1:${server.port}/`)
    expect(response.status).toBe(200)
  })

  it('falls back to another port when the default one is taken', async () => {
    const first = await start(0)

    const second = await start(first.port, false)

    expect(second.port).not.toBe(first.port)
  })

  it('fails on a taken port given explicitly', async () => {
    const first = await start(0)

    await expect(start(first.port, true)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
  })
})

describe('startServer access', () => {
  let clientDir: string
  let root: string
  let servers: RunningServer[]

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-root-')))
    servers = []
  })

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()))
    rmSync(clientDir, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  async function start() {
    const server = await startServer({
      clientDir,
      facesDir: clientDir,
      root,
      port: 0,
      openUrl: () => {},
    })
    servers.push(server)
    return server
  }

  const keyFile = () => readFileSync(join(root, '.run/board-key.json'), 'utf8')

  it('keeps the same key across a restart over one root', async () => {
    const first = await start()
    const written = keyFile()
    await first.close()
    servers.length = 0

    await start()

    expect(keyFile()).toBe(written)
  })

  it('hands out a redeem URL that sets the cookie once', async () => {
    const server = await start()

    const url = server.boardUrl()
    const first = await fetch(url, { redirect: 'manual' })
    const again = await fetch(url, { redirect: 'manual' })

    expect(url).toMatch(
      new RegExp(
        `^http://127\\.0\\.0\\.1:${server.port}/api/access/redeem\\?ticket=[0-9a-f]{32}$`,
      ),
    )
    expect(first.status).toBe(303)
    expect(first.headers.get('set-cookie')).toContain(JSON.parse(keyFile()).key)
    expect(again.status).toBe(303)
    expect(again.headers.get('set-cookie')).toBeNull()
  })

  it('lets the cookie from a redeem write when it sends the board origin', async () => {
    const server = await start()
    const redeemed = await fetch(server.boardUrl(), { redirect: 'manual' })
    const cookie =
      (redeemed.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const origin = `http://127.0.0.1:${server.port}`
    const show = (headers: Record<string, string>) =>
      fetch(`${origin}/api/show`, {
        method: 'POST',
        headers: { cookie, ...headers },
        body: JSON.stringify({ ref: 'studio/home/hero' }),
      })

    expect((await show({ origin })).status).toBe(200)
    expect((await show({})).status).toBe(401)
    expect(
      (await show({ origin: `http://127.0.0.1:${server.port + 1}` })).status,
    ).toBe(401)
  })
})

describe('startServer live socket', () => {
  let clientDir: string
  let board: FixtureBoard
  let server: RunningServer
  let socket: WebSocket
  let messages: ServerMessage[]
  let hello: ServerMessage[]

  beforeEach(async () => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    board = copyFixtureBoard('live')
    server = await startServer({
      clientDir,
      facesDir: clientDir,
      root: board.root,
      port: 0,
      openUrl: () => {},
    })
    messages = []
    socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await expect.poll(() => messages.length).toBe(4)
    hello = messages
    messages = []
  })

  afterEach(async () => {
    socket.terminate()
    await server.close()
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('sends the board, whether it may write, the listeners, and then every frame checked on hello', () => {
    expect(hello.map((message) => message.type)).toEqual([
      'board',
      'access',
      'listeners',
      'findings',
    ])
    expect(hello[1]).toEqual({ type: 'access', write: false })
    expect(hello[2]).toEqual({ type: 'listeners', listeners: [] })
    expect(hello[3]).toMatchObject({
      findings: { 'studio/home/hero': expect.any(Array) },
    })
  })

  it('pushes a reply the CLI writes to the board as its page notes', async () => {
    writeFileSync(
      join(board.root, 'studio/home/notes.json'),
      JSON.stringify({
        version: 1,
        notes: [
          {
            id: 'n_0000000a',
            number: 1,
            frame: 'hero',
            anchor: null,
            text: 'Tighten the header',
            from: 'developer',
            author: null,
            session: null,
            to: null,
            state: 'open',
            thread: null,
            createdAt: '2026-10-19T10:00:00.000Z',
            updatedAt: '2026-10-19T10:00:00.000Z',
          },
        ],
      }),
    )
    await expect
      .poll(() => messages.some((message) => message.type === 'notes'), {
        timeout: 5000,
      })
      .toBe(true)
    messages = []

    await cli(['notes', 'reply', 'n_0000000a', 'Tightened'], {
      cwd: board.root,
    })

    await expect
      .poll(() => messages.find((message) => message.type === 'notes'), {
        timeout: 5000,
      })
      .toMatchObject({
        type: 'notes',
        page: 'studio/home',
        notes: [
          { id: 'n_0000000a' },
          { text: 'Tightened', from: 'agent', thread: 'n_0000000a' },
        ],
      })
  })

  it('counts the connected board as an open tab that cannot write', () => {
    expect(server.tabs.count).toBe(1)
    expect(server.tabs.writers).toBe(0)
  })

  it('sends a frame the show route names to the board tab', async () => {
    server.authorize('c'.repeat(64))

    const response = await fetch(`http://127.0.0.1:${server.port}/api/show`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'c'.repeat(64)}` },
      body: JSON.stringify({ ref: 'studio/pricing/plans' }),
    })

    expect(await response.json()).toEqual({
      ok: true,
      data: { ref: 'studio/pricing/plans', tabs: 1 },
    })
    await expect
      .poll(() => messages.at(-1))
      .toEqual({ type: 'show', ref: 'studio/pricing/plans' })
  })

  it('pushes the board, the changed frame, and its findings after a write', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect
      .poll(() => messages.map((message) => message.type), {
        timeout: 5000,
      })
      .toEqual(['board', 'reload', 'findings'])
    expect(messages[1]).toEqual({ type: 'reload', refs: ['studio/home/hero'] })
    expect(messages[2]).toMatchObject({
      type: 'findings',
      findings: { 'studio/home/hero': [{ rule: 'default-font' }] },
    })
  })

  it('reloads only the frame saved through a temp file and a rename', async () => {
    const frame = join(board.root, 'studio/home/hero.html')
    writeFileSync(`${frame}.swap`, '<p>saved</p>')
    renameSync(`${frame}.swap`, frame)

    // The temp write and the rename can land in one batch or two, and either
    // way no reload may name another frame on the page.
    const reloads = () =>
      messages.flatMap((message) =>
        message.type === 'reload' ? message.refs : [],
      )
    await expect.poll(reloads, { timeout: 5000 }).toContain('studio/home/hero')
    expect(new Set(reloads())).toEqual(new Set(['studio/home/hero']))
  })

  it('pushes the board and reloads nothing for a layout write', async () => {
    writeFileSync(
      join(board.root, 'studio/pricing/layout.json'),
      '{ "version": 1, "frames": {} }',
    )

    await expect.poll(() => messages.length, { timeout: 5000 }).toBe(1)
    expect(messages[0]?.type).toBe('board')
  })
})

describe('BoardTabs', () => {
  it('resolves true when a writing tab connects within the wait', async () => {
    const tabs = new BoardTabs()

    const waiting = tabs.waitForWriter(1000)
    tabs.open(true)

    expect(await waiting).toBe(true)
  })

  it('resolves false when only a reader connects within the wait', async () => {
    const tabs = new BoardTabs()

    const waiting = tabs.waitForWriter(10)
    tabs.open(false)

    expect(await waiting).toBe(false)
  })

  it('counts a writer apart from a reader and drops each on close', () => {
    const tabs = new BoardTabs()
    tabs.open(true)
    tabs.open(false)

    expect([tabs.count, tabs.writers]).toEqual([2, 1])

    tabs.close(true)
    tabs.close(false)
    expect([tabs.count, tabs.writers]).toEqual([0, 0])
  })
})
