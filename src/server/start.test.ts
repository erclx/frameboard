import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { BoardTabs, type RunningServer, startServer } from './start'

describe('startServer', () => {
  let clientDir: string
  let servers: RunningServer[]

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
    servers = []
  })

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()))
    rmSync(clientDir, { recursive: true, force: true })
  })

  async function start(port: number, strictPort?: boolean) {
    const server = await startServer({
      clientDir,
      root: '/board',
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

describe('startServer live socket', () => {
  let clientDir: string
  let board: FixtureBoard
  let server: RunningServer
  let socket: WebSocket
  let messages: ServerMessage[]

  beforeEach(async () => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    board = copyFixtureBoard('live')
    server = await startServer({
      clientDir,
      root: board.root,
      port: 0,
      openUrl: () => {},
    })
    messages = []
    socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await expect.poll(() => messages.length).toBe(1)
    messages = []
  })

  afterEach(async () => {
    socket.terminate()
    await server.close()
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('counts the connected board as an open tab', async () => {
    expect(await server.tabs.waitForOne(1000)).toBe(true)
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

  it('pushes the board and then the changed frame after a write', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect
      .poll(() => messages.map((message) => message.type), {
        timeout: 5000,
      })
      .toEqual(['board', 'reload'])
    expect(messages[1]).toEqual({ type: 'reload', refs: ['studio/home/hero'] })
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
  it('resolves true when a tab connects within the wait', async () => {
    const tabs = new BoardTabs()

    const waiting = tabs.waitForOne(1000)
    tabs.open()

    expect(await waiting).toBe(true)
  })

  it('resolves false when no tab connects within the wait', async () => {
    expect(await new BoardTabs().waitForOne(10)).toBe(false)
  })
})
