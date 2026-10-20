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

// The server's browser sweep refuses at once, so no spec here starts Chromium.
async function noBrowser(): Promise<never> {
  throw new Error('No browser in this spec.')
}

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
      launch: noBrowser,
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
      launch: noBrowser,
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

describe('startServer live socket', { timeout: 15_000 }, () => {
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
      launch: noBrowser,
    })
    messages = []
    socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await expect.poll(() => messages.length, { timeout: 5000 }).toBe(7)
    hello = messages
    messages = []
  })

  afterEach(async () => {
    socket.terminate()
    await server.close()
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('sends the board, whether it may write, the history, the claims, the changes, the listeners, and then every frame checked on hello', () => {
    expect(hello.map((message) => message.type)).toEqual([
      'board',
      'access',
      'history',
      'claims',
      'changes',
      'listeners',
      'findings',
    ])
    expect(hello[1]).toEqual({ type: 'access', write: false })
    expect(hello[2]).toEqual({ type: 'history', undo: 0, redo: 0 })
    expect(hello[3]).toEqual({ type: 'claims', claims: [] })
    expect(hello[4]).toEqual({ type: 'changes', changes: [] })
    expect(hello[5]).toEqual({ type: 'listeners', listeners: [] })
    expect(hello[6]).toMatchObject({
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

  it('pushes a claim the CLI writes to the board alone, with no rescan', async () => {
    await cli(['editing', 'studio/home/hero', '--session', 'sess-a'], {
      cwd: board.root,
    })

    await expect
      .poll(() => messages.at(-1), { timeout: 5000 })
      .toMatchObject({
        type: 'claims',
        claims: [{ frame: 'studio/home/hero', session: 'sess-a' }],
      })
    // The watcher can report the claims file in two batches under load, so a
    // repeated claims push is allowed, and anything else is a rescan.
    expect(messages.filter((message) => message.type !== 'claims')).toEqual([])
  })

  it('pushes the claims again once one expires, with no write', async () => {
    const soon = new Date(Date.now() + 300).toISOString()
    writeFileSync(
      join(board.root, '.run/claims.json'),
      JSON.stringify({
        version: 1,
        claims: [
          {
            frame: 'studio/home/hero',
            session: 'sess-a',
            agent: 'claude',
            tag: 'claude · studio',
            claimedAt: new Date().toISOString(),
            expiresAt: soon,
          },
        ],
      }),
    )
    await expect
      .poll(() => messages.at(-1), { timeout: 5000 })
      .toMatchObject({ type: 'claims', claims: [{ expiresAt: soon }] })

    await expect
      .poll(() => messages.at(-1), { timeout: 5000 })
      .toEqual({ type: 'claims', claims: [] })
  })

  it('pushes no claims for a claims file that does not parse', async () => {
    await cli(['editing', 'studio/home/hero', '--session', 'sess-a'], {
      cwd: board.root,
    })
    await expect
      .poll(() => messages.at(-1)?.type, { timeout: 5000 })
      .toBe('claims')

    writeFileSync(join(board.root, '.run/claims.json'), '{ not json')

    await expect
      .poll(() => messages.at(-1), { timeout: 5000 })
      .toEqual({ type: 'claims', claims: [] })
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

  it('pushes the board, the changed frame, its findings, and then the change after a write', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect
      .poll(() => messages.map((message) => message.type), {
        timeout: 5000,
      })
      .toEqual(['board', 'reload', 'findings', 'changes'])
    expect(messages[1]).toEqual({ type: 'reload', refs: ['studio/home/hero'] })
    expect(messages[2]).toMatchObject({
      type: 'findings',
      findings: { 'studio/home/hero': [{ rule: 'default-font' }] },
    })
  })

  it("marks a frame written from disk as a change by its claim's agent", async () => {
    await cli(['editing', 'studio/home/hero', '--session', 'sess-a'], {
      cwd: board.root,
    })
    await expect
      .poll(() => messages.at(-1)?.type, { timeout: 5000 })
      .toBe('claims')

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect
      .poll(() => messages.find((message) => message.type === 'changes'), {
        timeout: 5000,
      })
      .toMatchObject({
        type: 'changes',
        changes: [{ frame: 'studio/home/hero', author: { session: 'sess-a' } }],
      })
  })

  it('marks nothing for a frame the board itself renamed', async () => {
    const token = 'c'.repeat(64)
    server.authorize(token)

    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/frame/rename`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ ref: 'studio/home/hero', name: 'banner' }),
      },
    )
    expect(response.status).toBe(200)

    // An agent write after it is the sentinel: the rename's batch is read
    // before or with the sentinel's, so its change arrives last and alone.
    writeFileSync(join(board.root, 'studio/pricing/plans.html'), '<p>new</p>')

    await expect
      .poll(
        () =>
          messages.flatMap((message) =>
            message.type === 'changes'
              ? message.changes.map((change) => change.frame)
              : [],
          ),
        { timeout: 5000 },
      )
      .toEqual(['studio/pricing/plans'])
  })

  it('marks nothing for 20 frames the board pasted at once', async () => {
    const token = 'c'.repeat(64)
    server.authorize(token)
    const names = Array.from({ length: 20 }, (_, at) => `card-${at}`)
    for (const name of names) {
      writeFileSync(
        join(board.root, `studio/home/${name}.html`),
        `<p>${name}</p>`,
      )
    }
    const changed = () =>
      messages.flatMap((message) =>
        message.type === 'changes'
          ? message.changes.map((change) => change.frame)
          : [],
      )
    const post = (path: string, body: unknown) =>
      fetch(`http://127.0.0.1:${server.port}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    // The copy reads the files from disk, so it needs no batch to have landed.
    await post('/api/clipboard/copy', {
      refs: names.map((name) => `studio/home/${name}`),
    })

    const pasted = await post('/api/clipboard/paste', { ref: 'studio/pricing' })
    writeFileSync(join(board.root, 'studio/pricing/plans.html'), '<p>new</p>')

    expect(pasted.status).toBe(200)
    // The sentinel lands with or after the paste's batch.
    await expect
      .poll(changed, { timeout: 5000 })
      .toContain('studio/pricing/plans')
    expect(
      changed().filter((frame) => frame.startsWith('studio/pricing/card-')),
    ).toEqual([])
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
