import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'

import { BoardTabs } from '../start'
import { createHub, type LiveHub } from './hub'

const SNAPSHOT: ListResult = { root: '/board', projects: [] }

describe('createHub', () => {
  let server: Server
  let hub: LiveHub
  let tabs: BoardTabs
  let port: number
  let sockets: WebSocket[]

  beforeEach(async () => {
    tabs = new BoardTabs()
    sockets = []
    server = createServer()
    hub = createHub({
      tabs,
      port: () => port,
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
  }: { path?: string; origin?: string } = {}): WebSocket {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, {
      headers: origin ? { origin } : {},
    })
    sockets.push(socket)
    return socket
  }

  function nextMessage(socket: WebSocket): Promise<ServerMessage> {
    return new Promise((resolve) =>
      socket.once('message', (data) => resolve(JSON.parse(String(data)))),
    )
  }

  async function helloAsBoard(socket: WebSocket): Promise<ServerMessage> {
    await new Promise((resolve) => socket.once('open', resolve))
    const first = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    return first
  }

  it('sends the board snapshot on a board hello', async () => {
    const message = await helloAsBoard(connect())

    expect(message).toEqual({ type: 'board', data: SNAPSHOT })
  })

  it('counts a board client as an open tab until it closes', async () => {
    const socket = connect()
    await helloAsBoard(socket)

    expect(tabs.count).toBe(1)

    socket.close()
    await expect.poll(() => tabs.count).toBe(0)
  })

  it('counts a client that never says hello as no tab', async () => {
    const socket = connect()
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'inbox' }))
    socket.send('not json')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(tabs.count).toBe(0)
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
    const message = await helloAsBoard(
      connect({ origin: `http://localhost:${port}` }),
    )

    expect(message.type).toBe('board')
  })
})
