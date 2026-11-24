import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'
import type { Finding } from '@/shared/records/check'

import { cli } from '../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import {
  launchShellOrNull,
  SHELL_HOOK_TIMEOUT_MS,
} from '../../test/support/headless-shell'
import { withoutRepeats } from '../../test/support/live-pushes'
import { loadChanges } from './changes/persist'
import type { RememberedFrame } from './live/remembered'
import {
  BoardTabs,
  type RunningServer,
  type StartOptions,
  startServer,
} from './start'

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

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

  it('serves a frame from a second loopback port until closed', async () => {
    mkdirSync(join(root, 'studio/home'), { recursive: true })
    writeFileSync(join(root, 'studio/home/hero.html'), '<h1>Studio</h1>')
    const server = await start(0)
    const url = `http://127.0.0.1:${server.framePort}/frames/studio/home/hero.html`

    const response = await fetch(url)
    await server.close()

    expect(server.framePort).not.toBe(server.port)
    expect(await response.text()).toContain('<h1>Studio</h1>')
    await expect(fetch(url)).rejects.toThrow()
  })

  it("serves no frame page on the board's own port", async () => {
    mkdirSync(join(root, 'studio/home'), { recursive: true })
    writeFileSync(join(root, 'studio/home/hero.html'), '<h1>Studio</h1>')
    const server = await start(0)

    const response = await fetch(
      `http://127.0.0.1:${server.port}/frames/studio/home/hero.html`,
      { redirect: 'manual' },
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `http://127.0.0.1:${server.framePort}/frames/studio/home/hero.html`,
    )
    expect(await response.text()).not.toContain('<h1>Studio</h1>')
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

  async function start(options: { openRoute?: boolean } = {}) {
    const server = await startServer({
      clientDir,
      facesDir: clientDir,
      root,
      port: 0,
      openUrl: () => {},
      launch: noBrowser,
      ...options,
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
  it('sets the cookie through the open route when the server opts in', async () => {
    const server = await start({ openRoute: true })
    const origin = `http://127.0.0.1:${server.port}`

    const opened = await fetch(`${origin}/api/access/open`, {
      redirect: 'manual',
    })
    const redeemed = await fetch(
      `${origin}${opened.headers.get('location') ?? ''}`,
      { redirect: 'manual' },
    )

    expect(opened.status).toBe(303)
    expect(redeemed.headers.get('location')).toBe('/')
    expect(redeemed.headers.get('set-cookie')).toContain(
      JSON.parse(keyFile()).key,
    )
  })

  it('answers 404 on the open route by default', async () => {
    const server = await start()

    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/access/open`,
      { redirect: 'manual' },
    )

    expect(response.status).toBe(404)
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
    // A push can land before the poll looks again, so the hello is the first eight.
    await expect
      .poll(() => messages.length, { timeout: 5000 })
      .toBeGreaterThanOrEqual(8)
    // The start's check can still be sending its slices.
    await expect
      .poll(
        () =>
          new Set(
            messages.flatMap((message) =>
              message.type === 'findings' ? Object.keys(message.findings) : [],
            ),
          ).size,
        { timeout: 5000 },
      )
      .toBe(3)
    hello = messages.slice(0, 8)
    messages = []
  })

  afterEach(async () => {
    socket.terminate()
    await server.close()
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('sends the frame port, the board, whether it may write, the history, the claims, the changes, the listeners, and then the findings on hello', () => {
    expect(hello.map((message) => message.type)).toEqual([
      'frames',
      'board',
      'access',
      'history',
      'claims',
      'changes',
      'listeners',
      'findings',
    ])
    expect(hello[0]).toEqual({ type: 'frames', port: server.framePort })
    expect(hello[2]).toEqual({ type: 'access', write: false, dispatch: false })
    expect(hello[3]).toEqual({ type: 'history', undo: 0, redo: 0 })
    expect(hello[4]).toEqual({ type: 'claims', claims: [] })
    expect(hello[5]).toEqual({ type: 'changes', changes: [] })
    expect(hello[6]).toEqual({ type: 'listeners', listeners: [] })
    expect(hello[7]).toMatchObject({ findings: expect.any(Object) })
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
    // A repeated claims push is allowed, since load can split the batch.
    expect(messages.filter((message) => message.type !== 'claims')).toEqual([])
  })

  it('pushes the claims again once one expires, with no write', async () => {
    const soon = new Date(Date.now() + 1000).toISOString()
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
    // Any push carrying the claim, since a loaded runner can skip its window.
    await expect
      .poll(
        () =>
          messages.some(
            (message) =>
              message.type === 'claims' &&
              message.claims.some((claim) => claim.expiresAt === soon),
          ),
        { timeout: 5000 },
      )
      .toBe(true)

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
      data: {
        ref: 'studio/pricing/plans',
        refs: ['studio/pricing/plans'],
        tabs: 1,
      },
    })
    await expect
      .poll(() => messages.at(-1))
      .toEqual({ type: 'show', ref: 'studio/pricing/plans' })
  })

  it('pushes the board, the changed frame, its stale thumbnails, its findings, and then the change after a write', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    // Reads without a split batch's repeats, so a reorder or new payload still fails.
    await expect
      .poll(() => withoutRepeats(messages).map((message) => message.type), {
        timeout: 5000,
      })
      .toEqual([
        'board',
        'reload',
        'thumbnails',
        'thumbnails',
        'findings',
        'changes',
      ])
    const pushes = withoutRepeats(messages)
    expect(pushes[1]).toEqual({
      type: 'reload',
      refs: ['studio/home/hero'],
      hashes: { 'studio/home/hero': sha256('<p>new</p>') },
    })
    expect(pushes.slice(2, 4)).toEqual([
      {
        type: 'thumbnails',
        theme: 'light',
        stamps: { 'studio/home/hero': null },
      },
      {
        type: 'thumbnails',
        theme: 'dark',
        stamps: { 'studio/home/hero': null },
      },
    ])
    expect(pushes[4]).toMatchObject({
      type: 'findings',
      findings: { 'studio/home/hero': [{ rule: 'default-font' }] },
    })
  })

  it('sends no hash for a frame a token change in the same batch reached', async () => {
    // The sheet goes first, so a batch split under load still opens on it.
    writeFileSync(join(board.root, 'tokens.css'), ':root { --gap: 4px; }')
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect
      .poll(() => messages.find((message) => message.type === 'reload'), {
        timeout: 5000,
      })
      .toMatchObject({ refs: expect.arrayContaining(['studio/home/hero']) })
    const reload = messages.find((message) => message.type === 'reload')
    expect(reload).not.toHaveProperty('hashes')
  })

  it('reads a second write of the same frame as the same pushes', async () => {
    const hero = join(board.root, 'studio/home/hero.html')
    const findingsCount = () =>
      messages.filter((message) => message.type === 'findings').length
    writeFileSync(hero, '<p>new</p>')
    await expect
      .poll(findingsCount, { timeout: 5000 })
      .toBeGreaterThanOrEqual(1)

    const { atimeMs, mtimeMs } = statSync(hero)

    // Restored in the same tick, ahead of any scan, so a split batch keeps the mtime.
    writeFileSync(hero, '<p>new</p>')
    utimesSync(hero, atimeMs / 1000, mtimeMs / 1000)

    await expect
      .poll(() => messages.some((message) => message.type === 'changes'), {
        timeout: 5000,
      })
      .toBe(true)
    expect(findingsCount()).toBeGreaterThanOrEqual(2)
    expect(withoutRepeats(messages).map((message) => message.type)).toEqual([
      'board',
      'reload',
      'thumbnails',
      'thumbnails',
      'findings',
      'changes',
    ])
  })

  it('answers a home view with no stamps and sends none when no browser launches', async () => {
    const ask = () =>
      fetch(`http://127.0.0.1:${server.port}/api/thumbnails?theme=light`).then(
        (response) => response.json(),
      )

    const first = await ask()
    const second = await ask()

    expect([first, second]).toEqual([
      { ok: true, data: { stamps: {} } },
      { ok: true, data: { stamps: {} } },
    ])
    expect(messages.filter((message) => message.type === 'thumbnails')).toEqual(
      [],
    )
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

  it('saves a change it has pushed before close resolves', async () => {
    // Closes inside the broadcasting turn, while the change log still saves.
    let closing: Promise<void> | undefined
    socket.on('message', (data) => {
      const message: ServerMessage = JSON.parse(String(data))
      if (
        closing === undefined &&
        message.type === 'changes' &&
        message.changes.length > 0
      ) {
        closing = server.close()
      }
    })

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')

    await expect.poll(() => closing !== undefined, { timeout: 5000 }).toBe(true)
    await closing
    const saved = await loadChanges(board.root, 100)
    expect(saved.changes.map((change) => change.frame)).toEqual([
      'studio/home/hero',
    ])
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

    // A sentinel write, so its change arrives last and alone.
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

    const pasted = await post('/api/clipboard/paste', {
      ref: 'studio/pricing',
    })
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

    // In one batch or two, no reload may name another frame on the page.
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

  it('reloads only the frame a layout write gives a kit', async () => {
    const layout = join(board.root, 'studio/home/layout.json')
    const file = JSON.parse(readFileSync(layout, 'utf8'))
    file.frames.hero.kit = 'sketch'
    writeFileSync(layout, JSON.stringify(file))

    const reloads = () =>
      messages.flatMap((message) =>
        message.type === 'reload' ? message.refs : [],
      )
    await expect.poll(reloads, { timeout: 5000 }).toContain('studio/home/hero')
    expect(new Set(reloads())).toEqual(new Set(['studio/home/hero']))
  })
})

const shell = await launchShellOrNull()
await shell?.close()

describe.skipIf(shell === null)(
  'startServer hugging',
  { timeout: 30_000 },
  () => {
    let clientDir: string
    let board: FixtureBoard
    let server: RunningServer
    let socket: WebSocket
    let messages: ServerMessage[]

    beforeEach(async () => {
      clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
      board = copyFixtureBoard('live')
      const layout = join(board.root, 'studio/home/layout.json')
      const file = JSON.parse(readFileSync(layout, 'utf8'))
      file.frames.hero.hugHeight = true
      writeFileSync(layout, JSON.stringify(file))
      const { chromium } = await import('playwright-core')
      server = await startServer({
        clientDir,
        facesDir: clientDir,
        root: board.root,
        port: 0,
        openUrl: () => {},
        launch: () => chromium.launch(),
      })
      messages = []
      socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
      socket.on('message', (data) => messages.push(JSON.parse(String(data))))
      await new Promise((resolve) => socket.once('open', resolve))
      socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
      await expect
        .poll(() => messages.length, { timeout: 10_000 })
        .toBeGreaterThanOrEqual(7)
      messages = []
    }, SHELL_HOOK_TIMEOUT_MS)

    afterEach(async () => {
      socket.terminate()
      await server.close()
      board.cleanup()
      rmSync(clientDir, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    const heroBox = (message: ServerMessage | undefined) =>
      message?.type === 'board'
        ? message.data.projects[0]?.pages
            .flatMap((page) => page.frames)
            .find((frame) => frame.ref === 'studio/home/hero')?.box
        : undefined

    it('sends the hugged box in the board that announces a content write, with no clipped finding', async () => {
      writeFileSync(
        join(board.root, 'studio/home/hero.html'),
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 1200px"></div></body></html>',
      )

      // The last board before the reload, since a settling sweep can push one ahead.
      const announcing = () => {
        const reload = messages.findIndex(
          (message) =>
            message.type === 'reload' &&
            message.refs.includes('studio/home/hero'),
        )
        return messages
          .slice(0, Math.max(reload, 0))
          .findLast((message) => message.type === 'board')
      }
      await expect.poll(announcing, { timeout: 10_000 }).toBeDefined()
      expect(heroBox(announcing())).toMatchObject({
        width: 1440,
        height: 1200,
      })
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'findings' &&
                'studio/home/hero' in message.findings,
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      const clipped = messages.flatMap((message) =>
        message.type === 'findings'
          ? (message.findings['studio/home/hero'] ?? []).filter(
              (finding) => finding.rule === 'clipped',
            )
          : [],
      )
      expect(clipped).toEqual([])
    })

    it('measures a frame written first and placed after, reloading nothing', async () => {
      writeFileSync(
        join(board.root, 'studio/home/tall.html'),
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 1200px"></div></body></html>',
      )
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'board' &&
                message.data.projects[0]?.pages.some((page) =>
                  page.frames.some((frame) => frame.ref === 'studio/home/tall'),
                ),
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      // A sentinel's reload means no reload of tall is still on its way.
      writeFileSync(join(board.root, 'studio/home/sentinel.html'), '<p>s</p>')
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'reload' &&
                message.refs.includes('studio/home/sentinel'),
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      messages = []

      await cli(['frame', 'add', 'studio/home/tall', '--size', 'desktop'], {
        cwd: board.root,
      })

      const tallHeight = () =>
        JSON.parse(
          readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
        ).frames.tall?.height
      await expect.poll(tallHeight, { timeout: 10_000 }).toBe(1200)
      expect(
        messages.some(
          (message) =>
            message.type === 'reload' &&
            message.refs.includes('studio/home/tall'),
        ),
      ).toBe(false)
    })

    it('measures a frame placed while another frame measures', async () => {
      writeFileSync(
        join(board.root, 'studio/home/quick.html'),
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 700px"></div></body></html>',
      )
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'board' &&
                message.data.projects[0]?.pages.some((page) =>
                  page.frames.some(
                    (frame) => frame.ref === 'studio/home/quick',
                  ),
                ),
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      // Settles first, so the checker cannot take the held request.
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'findings' &&
                'studio/home/quick' in message.findings,
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      // Held until the add lands, so it lands mid-measure.
      let requested: () => void = () => {}
      const measuring = new Promise<void>((resolve) => {
        requested = resolve
      })
      let release: () => void = () => {}
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      const held = createServer((_request, response) => {
        requested()
        void released.then(() => response.end(''))
      })
      await new Promise<void>((resolve) => held.listen(0, '127.0.0.1', resolve))
      const { port } = held.address() as AddressInfo

      try {
        writeFileSync(
          join(board.root, 'studio/home/hero.html'),
          `<!doctype html><html><head><style>body { margin: 0 }</style><script src="http://127.0.0.1:${port}/hold.js"></script></head><body><div style="height: 1200px"></div></body></html>`,
        )
        await measuring
        await cli(['frame', 'add', 'studio/home/quick', '--size', 'desktop'], {
          cwd: board.root,
        })
        release()

        const heights = () => {
          const { frames } = JSON.parse(
            readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
          )
          return [frames.hero?.height, frames.quick?.height]
        }
        await expect.poll(heights, { timeout: 10_000 }).toEqual([1200, 700])
      } finally {
        release()
        held.closeAllConnections()
        await new Promise((resolve) => held.close(resolve))
      }
    })

    it('measures a frame placed while a batch naming another file waits its turn', async () => {
      writeFileSync(
        join(board.root, 'studio/home/quick.html'),
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 700px"></div></body></html>',
      )
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'findings' &&
                'studio/home/quick' in message.findings,
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      let requested: () => void = () => {}
      let release: () => void = () => {}
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      const held = createServer((_request, response) => {
        requested()
        void released.then(() => response.end(''))
      })
      await new Promise<void>((resolve) => held.listen(0, '127.0.0.1', resolve))
      const { port } = held.address() as AddressInfo
      const hero = join(board.root, 'studio/home/hero.html')
      const other = join(board.root, 'studio/home/other.html')
      const batched = (path: string) =>
        new Promise<void>((resolve) => {
          const stop = server.watcher.onBatch((paths) => {
            if (!paths.includes(path)) return
            stop()
            resolve()
          })
        })

      try {
        const heroBatched = batched(hero)
        // Hero's measure keeps its box, so its batch writes nothing and rescans nothing.
        writeFileSync(
          hero,
          `<!doctype html><html><head><style>body { margin: 0 }</style><script src="http://127.0.0.1:${port}/hold.js"></script></head><body><div style="height: 900px"></div></body></html>`,
        )
        await heroBatched
        // The checker can load hero before its batch, so only a later request is the measure.
        await new Promise<void>((resolve) => {
          requested = resolve
        })
        const otherBatched = batched(other)
        writeFileSync(other, '<p>other</p>')
        await otherBatched
        await cli(['frame', 'add', 'studio/home/quick', '--size', 'desktop'], {
          cwd: board.root,
        })
        release()

        const quickHeight = () =>
          JSON.parse(
            readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
          ).frames.quick?.height
        await expect.poll(quickHeight, { timeout: 10_000 }).toBe(700)
      } finally {
        release()
        held.closeAllConnections()
        await new Promise((resolve) => held.close(resolve))
      }
    })
  },
)

describe.skipIf(shell === null)(
  'startServer start measure',
  { timeout: 30_000 },
  () => {
    let clientDir: string
    let board: FixtureBoard
    let servers: RunningServer[]
    let sockets: WebSocket[]

    beforeEach(() => {
      clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
      board = copyFixtureBoard('live')
      const layout = join(board.root, 'studio/home/layout.json')
      const file = JSON.parse(readFileSync(layout, 'utf8'))
      file.frames.hero.hugHeight = true
      writeFileSync(layout, JSON.stringify(file))
      servers = []
      sockets = []
    })

    afterEach(async () => {
      for (const socket of sockets) socket.terminate()
      await Promise.all(servers.map((server) => server.close()))
      board.cleanup()
      rmSync(clientDir, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    // Dated against the layout, which the start sweep reads as edited offline or not.
    const writeHero = (html: string, offsetMs: number) => {
      const path = join(board.root, 'studio/home/hero.html')
      writeFileSync(path, html)
      const layout = statSync(join(board.root, 'studio/home/layout.json'))
      const at = new Date(layout.mtimeMs + offsetMs)
      utimesSync(path, at, at)
    }

    async function start() {
      const { chromium } = await import('playwright-core')
      const server = await startServer({
        clientDir,
        facesDir: clientDir,
        root: board.root,
        port: 0,
        openUrl: () => {},
        launch: () => chromium.launch(),
      })
      servers.push(server)
      return server
    }

    async function connect(server: RunningServer) {
      const messages: ServerMessage[] = []
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
      sockets.push(socket)
      socket.on('message', (data) => messages.push(JSON.parse(String(data))))
      await new Promise((resolve) => socket.once('open', resolve))
      socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
      return messages
    }

    const heroHeights = (messages: ServerMessage[]) =>
      messages.flatMap((message) =>
        message.type === 'board'
          ? (message.data.projects[0]?.pages
              .flatMap((page) => page.frames)
              .filter((frame) => frame.ref === 'studio/home/hero')
              .map((frame) => frame.box.height) ?? [])
          : [],
      )

    it('sends a hello during the measure the stored size, then the measured board', async () => {
      // Held until the hello hears a board, so the measure is still running then.
      let requested: () => void = () => {}
      const measuring = new Promise<void>((resolve) => {
        requested = resolve
      })
      let release: () => void = () => {}
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      const held = createServer((_request, response) => {
        requested()
        void released.then(() => response.end(''))
      })
      await new Promise<void>((resolve) => held.listen(0, '127.0.0.1', resolve))
      const { port } = held.address() as AddressInfo

      try {
        writeHero(
          `<!doctype html><html><head><style>body { margin: 0 }</style><script src="http://127.0.0.1:${port}/hold.js"></script></head><body><div style="height: 1200px"></div></body></html>`,
          5000,
        )
        const server = await start()
        await measuring
        const messages = await connect(server)

        await expect
          .poll(() => heroHeights(messages), { timeout: 10_000 })
          .toEqual([900])
        release()
        // The last board, since the measure's own layout write sends one more.
        await expect
          .poll(() => heroHeights(messages).at(-1), { timeout: 10_000 })
          .toBe(1200)
      } finally {
        release()
        held.closeAllConnections()
        await new Promise((resolve) => held.close(resolve))
      }
    })

    it('sends one board on a start with no frame written since its layout', async () => {
      writeHero(
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 900px"></div></body></html>',
        -5000,
      )
      const server = await start()
      const messages = await connect(server)

      // A sentinel's reload lands behind any board the start still owed.
      writeFileSync(join(board.root, 'studio/home/sentinel.html'), '<p>s</p>')
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === 'reload' &&
                message.refs.includes('studio/home/sentinel'),
            ),
          { timeout: 10_000 },
        )
        .toBe(true)
      expect(heroHeights(messages)).toEqual([900, 900])
    })

    it('measures a frame placed while the start measure waits its turn to rescan', async () => {
      const layout = join(board.root, 'studio/home/layout.json')
      const file = JSON.parse(readFileSync(layout, 'utf8'))
      file.frames.mobile.hugHeight = true
      writeFileSync(layout, JSON.stringify(file))
      writeFileSync(
        join(board.root, 'studio/home/quick.html'),
        '<!doctype html><html><head><style>body { margin: 0 }</style></head><body><div style="height: 700px"></div></body></html>',
      )
      const waiting = new Map<string, () => void>()
      const requested = (path: string) =>
        new Promise<void>((resolve) => waiting.set(path, resolve))
      const releases = new Map<string, () => void>()
      const gates = new Map(
        ['/start.js', '/mobile.js'].map((path) => [
          path,
          new Promise<void>((resolve) => releases.set(path, resolve)),
        ]),
      )
      const releaseAll = () => {
        for (const release of releases.values()) release()
      }
      const held = createServer((request, response) => {
        const path = request.url ?? ''
        waiting.get(path)?.()
        void (gates.get(path) ?? Promise.resolve()).then(() => response.end(''))
      })
      await new Promise<void>((resolve) => held.listen(0, '127.0.0.1', resolve))
      const { port } = held.address() as AddressInfo
      const frames = () => JSON.parse(readFileSync(layout, 'utf8')).frames

      try {
        const startMeasuring = requested('/start.js')
        writeHero(
          `<!doctype html><html><head><style>body { margin: 0 }</style><script src="http://127.0.0.1:${port}/start.js"></script></head><body><div style="height: 1200px"></div></body></html>`,
          5000,
        )
        const server = await start()
        await startMeasuring
        const mobile = join(board.root, 'studio/home/mobile.html')
        const mobileBatched = new Promise<void>((resolve) => {
          const stop = server.watcher.onBatch((paths) => {
            if (!paths.includes(mobile)) return
            stop()
            resolve()
          })
        })
        // Mobile keeps its box, so its batch holds the turn and rescans nothing.
        writeFileSync(
          mobile,
          `<!doctype html><html><head><style>body { margin: 0 }</style><script src="http://127.0.0.1:${port}/mobile.js"></script></head><body><div style="height: 844px"></div></body></html>`,
        )
        await mobileBatched
        // The checker can load mobile before its batch, so only a later request is the measure.
        await requested('/mobile.js')
        releases.get('/start.js')?.()
        await expect.poll(() => frames().hero.height).toBe(1200)
        await cli(['frame', 'add', 'studio/home/quick', '--size', 'desktop'], {
          cwd: board.root,
        })
        releases.get('/mobile.js')?.()

        await expect
          .poll(() => frames().quick?.height, { timeout: 10_000 })
          .toBe(700)
      } finally {
        releaseAll()
        held.closeAllConnections()
        await new Promise((resolve) => held.close(resolve))
      }
    })
  },
)

describe('startServer remembered checks', { timeout: 30_000 }, () => {
  const TOKEN = 'd'.repeat(64)
  const REFS = [
    'studio/home/hero',
    'studio/home/mobile',
    'studio/pricing/plans',
  ]
  const page = (body: string) =>
    `<!doctype html><html><head><style>body { margin: 0 }</style></head><body>${body}</body></html>`

  let clientDir: string
  let board: FixtureBoard
  let servers: RunningServer[]
  let sockets: WebSocket[]
  let release: () => void

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    board = copyFixtureBoard('live')
    // Content at the stored height, so a measure writes nothing.
    write('studio/home/hero.html', page('<div style="height: 900px"></div>'))
    write('studio/home/mobile.html', page('<div style="height: 844px"></div>'))
    write(
      'studio/pricing/plans.html',
      page('<div style="width: 9000px; height: 40px"></div>'),
    )
    editFrames((frames) => {
      frames.hero.hugHeight = true
      frames.mobile.hugHeight = true
    })
    servers = []
    sockets = []
    release = () => {}
  })

  afterEach(async () => {
    release()
    for (const socket of sockets) socket.terminate()
    await Promise.all(servers.map((server) => server.close()))
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  }, SHELL_HOOK_TIMEOUT_MS)

  function write(path: string, contents: string) {
    writeFileSync(join(board.root, path), contents)
  }

  function editFrames(
    edit: (frames: Record<'hero' | 'mobile', Record<string, unknown>>) => void,
  ) {
    const path = join(board.root, 'studio/home/layout.json')
    const file = JSON.parse(readFileSync(path, 'utf8'))
    edit(file.frames)
    writeFileSync(path, JSON.stringify(file))
  }

  async function start(
    options: Pick<StartOptions, 'launch' | 'pause'> = {},
  ): Promise<RunningServer> {
    const server = await startServer({
      clientDir,
      facesDir: clientDir,
      root: board.root,
      port: 0,
      openUrl: () => {},
      launch: noBrowser,
      ...options,
    })
    server.authorize(TOKEN)
    servers.push(server)
    return server
  }

  /** A pause that holds every slice of the start's check until `release`. */
  function heldPause() {
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    return () => gate
  }

  async function connect(server: RunningServer) {
    const messages: ServerMessage[] = []
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
    sockets.push(socket)
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    return messages
  }

  /** The findings a hello carries, as against what the start sends after it. */
  async function helloFindings(server: RunningServer) {
    const messages = await connect(server)
    const first = () =>
      messages.find((message) => message.type === 'findings')?.findings
    await expect.poll(first, { timeout: 5000 }).toBeDefined()
    return { findings: first() ?? {}, messages }
  }

  function findingsSent(messages: ServerMessage[]) {
    return Object.assign(
      {},
      ...messages.map((message) =>
        message.type === 'findings' ? message.findings : {},
      ),
    ) as Record<string, Finding[]>
  }

  async function check(server: RunningServer, refs: string[]) {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/checks`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refs }),
    })
    return response.json()
  }

  const stored = (): Record<string, RememberedFrame> => {
    try {
      return JSON.parse(
        readFileSync(join(board.root, '.run/checks.json'), 'utf8'),
      ).frames
    } catch {
      return {}
    }
  }

  it('answers a hello, then sends the findings, while the start has yet to check', async () => {
    const server = await start({ pause: heldPause() })

    const { findings, messages } = await helloFindings(server)
    release()

    expect(findings).toEqual({})
    expect(messages.map((message) => message.type)).toContain('board')
    await expect
      .poll(() => Object.keys(findingsSent(messages)).sort(), { timeout: 5000 })
      .toEqual(REFS)
  })

  it("holds a check's answer until its frames are through the start's check", async () => {
    const server = await start({ pause: heldPause() })
    let answered = false
    const answer = check(server, ['studio/home/hero']).then(() => {
      answered = true
    })
    // Its turn comes after the first's, so by its answer the first only waits.
    await check(server, ['studio/home/none'])
    const before = answered
    release()
    await answer

    const { findings } = await helloFindings(server)
    expect(before).toBe(false)
    expect(Object.keys(findings)).toContain('studio/home/hero')
  })

  it("answers a second start's hello with the first's findings and no check", async () => {
    const first = await start()
    await check(first, REFS)
    const { findings: checked } = await helloFindings(first)
    await first.close()

    let slices = 0
    const second = await start({
      pause: async () => {
        slices += 1
      },
    })
    const { findings } = await helloFindings(second)

    expect(Object.keys(checked).sort()).toEqual(REFS)
    expect(findings).toEqual(checked)
    expect(slices).toBe(0)
  })

  it.each([
    [
      'a frame',
      'studio/home/hero.html',
      page('<p>new</p>'),
      ['studio/home/mobile', 'studio/pricing/plans'],
    ],
    [
      "a page's sheet",
      'studio/home/styles.css',
      'p { color: red }',
      ['studio/pricing/plans'],
    ],
    ['an asset', 'studio/assets/dot.svg', '<svg></svg>', []],
    [
      'project.json',
      'studio/project.json',
      '{ "version": 1, "pages": [] }',
      [],
    ],
    ['the token sheet', 'tokens.css', ':root { --ink: #111 }', []],
  ])(
    'rechecks what %s reaches when it was edited while no server ran',
    async (_name, path, contents, held) => {
      const first = await start()
      await check(first, REFS)
      await first.close()
      write(path, contents)

      const second = await start({ pause: heldPause() })
      const { findings, messages } = await helloFindings(second)
      release()

      expect(Object.keys(findings).sort()).toEqual(held)
      await expect
        .poll(() => Object.keys(findingsSent(messages)).sort(), {
          timeout: 5000,
        })
        .toEqual(REFS)
    },
  )

  it('checks a frame written mid-sweep against its new bytes, and once', async () => {
    const server = await start({ pause: heldPause() })
    const messages = await connect(server)
    const hero = join(board.root, 'studio/home/hero.html')
    const heroFindings = () =>
      messages.flatMap((message) =>
        message.type === 'findings' && message.findings['studio/home/hero']
          ? [message.findings['studio/home/hero'].map(({ rule }) => rule)]
          : [],
      )

    writeFileSync(hero, '<p>bare</p>')
    await expect.poll(heroFindings, { timeout: 5000 }).toHaveLength(1)
    release()
    await expect
      .poll(() => Object.keys(findingsSent(messages)).sort(), { timeout: 5000 })
      .toEqual(REFS)

    expect(heroFindings()).toEqual([['default-font']])
  })

  it('shows a stored result on no other frame once its own is renamed', async () => {
    const first = await start()
    await check(first, REFS)
    await first.close()
    renameSync(
      join(board.root, 'studio/pricing/plans.html'),
      join(board.root, 'studio/pricing/prices.html'),
    )

    const second = await start({ pause: heldPause() })
    const { findings } = await helloFindings(second)

    expect(Object.keys(findings).sort()).toEqual([
      'studio/home/hero',
      'studio/home/mobile',
    ])
  })

  describe.skipIf(shell === null)('with a browser', () => {
    /** Chromium, and the frames its pages loaded. */
    function recorded() {
      const loaded = new Set<string>()
      const launch = async () => {
        const { chromium } = await import('playwright-core')
        const browser = await chromium.launch()
        const open = browser.newContext.bind(browser)
        browser.newContext = async (options) => {
          const context = await open(options)
          context.on('request', (request) => {
            if (!request.isNavigationRequest()) return
            const { pathname } = new URL(request.url())
            loaded.add(pathname.replace(/^\/frames\//, '').replace('.html', ''))
          })
          return context
        }
        return browser
      }
      return { launch, loaded }
    }

    /** Runs a first server until it remembers every result, and closes it. */
    async function warm() {
      const first = await start({ launch: recorded().launch })
      await expect
        .poll(
          () => {
            const frames = stored()
            return REFS.every(
              (ref) =>
                frames[ref]?.checks &&
                frames[ref].rendered &&
                (frames[ref].measured || ref === 'studio/pricing/plans'),
            )
          },
          { timeout: 20_000 },
        )
        .toBe(true)
      const { findings } = await helloFindings(first)
      await first.close()
      return findings
    }

    it('opens no page on a second start of an unchanged board, and sends the same findings', async () => {
      const before = await warm()
      const { launch, loaded } = recorded()

      const second = await start({ launch })
      const answer = await check(second, REFS)
      const { findings } = await helloFindings(second)
      await second.close()

      expect([...loaded]).toEqual([])
      expect(findings).toEqual(before)
      expect(findings['studio/pricing/plans']?.map(({ rule }) => rule)).toEqual(
        expect.arrayContaining(['clipped']),
      )
      expect(answer.data.browser).toEqual({ ran: true })
    })

    it('checks and measures a frame edited while no server ran, and no other', async () => {
      await warm()
      write('studio/home/hero.html', page('<div style="height: 1200px"></div>'))
      const { launch, loaded } = recorded()

      const second = await start({ launch })

      await expect
        .poll(
          () =>
            JSON.parse(
              readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
            ).frames.hero.height,
          { timeout: 10_000 },
        )
        .toBe(1200)
      await check(second, REFS)
      expect([...loaded]).toEqual(['studio/home/hero'])
    })

    it('checks again only a frame given a linked width while no server ran', async () => {
      await warm()
      editFrames((frames) => {
        frames.mobile.widths = [{ width: 834, height: 844 }]
      })
      const { launch, loaded } = recorded()

      const second = await start({ launch })
      await check(second, REFS)

      expect([...loaded]).toEqual(['studio/home/mobile'])
    })

    it('serves and keeps stored browser findings while no browser launches', async () => {
      const before = await warm()
      const kept = stored()
      editFrames((frames) => {
        frames.hero.width = 1200
      })
      write('studio/pricing/added.html', page('<p>added</p>'))

      const second = await start()
      await check(second, [...REFS, 'studio/pricing/added'])
      const { findings } = await helloFindings(second)
      await second.close()

      expect(findings['studio/pricing/plans']).toEqual(
        before['studio/pricing/plans'],
      )
      expect(stored()['studio/pricing/plans']).toEqual(
        kept['studio/pricing/plans'],
      )
      expect(stored()['studio/pricing/added']).toMatchObject({
        checks: { findings: expect.any(Array) },
      })
      expect(stored()['studio/pricing/added']?.rendered).toBeUndefined()
      expect(stored()['studio/home/hero']?.rendered).toBeUndefined()
    })
  })
})

describe('withoutRepeats', () => {
  const board = (name: string): ServerMessage =>
    ({ type: 'board', data: { name } }) as unknown as ServerMessage
  const reload: ServerMessage = { type: 'reload', refs: ['studio/home/hero'] }
  const stamps = (theme: 'light' | 'dark'): ServerMessage => ({
    type: 'thumbnails',
    theme,
    stamps: { 'studio/home/hero': null },
  })
  const findings: ServerMessage = { type: 'findings', findings: {} }
  const changes: ServerMessage = { type: 'changes', changes: [] }
  const kinds = (messages: ServerMessage[]) =>
    messages.map((message) => message.type)

  it('reads a write reported in two batches as one', () => {
    const split = [
      board('a'),
      reload,
      stamps('light'),
      stamps('dark'),
      findings,
      board('a'),
      reload,
      stamps('light'),
      stamps('dark'),
      changes,
    ]

    expect(kinds(withoutRepeats(split))).toEqual([
      'board',
      'reload',
      'thumbnails',
      'thumbnails',
      'findings',
      'changes',
    ])
  })

  it('keeps changes ahead of findings in the order it was sent', () => {
    const swapped = [board('a'), reload, changes, findings]

    expect(withoutRepeats(swapped)).toEqual(swapped)
  })

  it('drops a repeated findings that carries the same data', () => {
    const found: ServerMessage = {
      type: 'findings',
      findings: { 'studio/home/hero': [] },
    }

    expect(withoutRepeats([found, found])).toEqual([found])
  })

  it('keeps a repeated findings that carries different data', () => {
    const other: ServerMessage = {
      type: 'findings',
      findings: { 'studio/home/nav': [] },
    }
    const differing = [findings, other]

    expect(withoutRepeats(differing)).toEqual(differing)
  })

  it('keeps a repeated changes', () => {
    const doubled = [changes, changes]

    expect(withoutRepeats(doubled)).toEqual(doubled)
  })

  it('keeps a repeated board that carries different data', () => {
    const differing = [board('a'), board('b')]

    expect(withoutRepeats(differing)).toEqual(differing)
  })

  it('keeps a repeated reload that names another ref', () => {
    const other: ServerMessage = { type: 'reload', refs: ['studio/home/nav'] }

    expect(withoutRepeats([reload, other])).toEqual([reload, other])
  })

  it('keeps a thumbnails push for the other theme', () => {
    const pair = [stamps('light'), stamps('dark')]

    expect(withoutRepeats(pair)).toEqual(pair)
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
