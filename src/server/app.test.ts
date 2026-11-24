import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { createTickets } from './access/tickets'
import { createApp, isBoardHost } from './app'
import type { ClipboardFiles } from './clipboard/files'
import { History } from './history/stack'
import { createSelectionHolder } from './live/selection'

const PORT = 4173
const FRAME_PORT = 47123
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'

function buildApp(clientDir: string, clipboard: ClipboardFiles | null = null) {
  return createApp({
    clientDir,
    facesDir: clientDir,
    root: '/board',
    port: () => PORT,
    framePort: () => FRAME_PORT,
    tickets: createTickets(),
    actions: {
      access: {
        token: () => null,
        key: KEY,
        cookieName: COOKIE,
        isOwnOrigin: (host) => isBoardHost(host, PORT),
      },
      open: async () => false,
      show: async () => 0,
    },
    renderFrame: async () => Buffer.alloc(0),
    renderFilmstrip: async () => Buffer.alloc(0),
    clipboard,
    history: new History('/board'),
    selection: createSelectionHolder(() => 0),
    // Stand-ins, so the optional route groups mount for the write walk.
    checks: {
      refresh: async () => {},
      settle: async () => {},
      rendered: () => ({}),
      changed: () => ({}),
      unavailable: () => null,
    },
    thumbnails: {
      ask: () => ({}),
      invalidate: () => {},
      file: () => null,
      settled: async () => {},
      empty: async () => {},
    },
    preview: {
      start: async () => {
        throw new Error('No phone link in this spec.')
      },
      stop: async () => false,
    },
  })
}

/** Every route the app mounts for a method other than a read, its parameters filled. */
const WRITE_ROUTES = buildApp('/nowhere')
  .routes.filter(({ method }) => !['GET', 'HEAD', 'ALL'].includes(method))
  .map(({ method, path }) => [
    method,
    path.replace(/:[^/]+/g, 'x').replace(/\*/g, 'x'),
  ])

describe('createApp', () => {
  let clientDir: string

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
  })

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true })
  })

  function request(
    url: string,
    clipboard: ClipboardFiles | null = null,
    init?: RequestInit,
  ) {
    return buildApp(clientDir, clipboard).request(url, init)
  }

  it('serves the client index with the version header', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/`)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-frameboard-version')).toBe(version)
    expect(await response.text()).toContain('<title>Frameboard</title>')
  })

  it('serves the client index for a board route, which the client routes', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/p/studio/home`)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Frameboard</title>')
  })

  it.each([['/'], ['/index.html'], ['/p/studio/home']])(
    'lets no page frame the client at %s',
    async (path) => {
      const response = await buildApp(clientDir).request(
        `http://127.0.0.1:${PORT}${path}`,
      )

      expect(response.headers.get('content-security-policy')).toBe(
        "frame-ancestors 'none'",
      )
    },
  )

  it('answers 404 for an unknown path outside the board routes', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/nowhere`)

    expect(response.status).toBe(404)
  })

  it('answers the health check with the board root', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/api/health`)

    expect(await response.json()).toEqual({
      version,
      root: '/board',
      tokens: null,
      clipboard: null,
    })
  })

  it('reports the clipboard backend on the health check', async () => {
    const wsl: ClipboardFiles = { backend: 'wsl', write: async () => {} }

    const response = await request(`http://127.0.0.1:${PORT}/api/health`, wsl)

    expect(await response.json()).toMatchObject({ clipboard: 'wsl' })
  })

  describe('frames', () => {
    it.each([
      ['127.0.0.1', 'GET'],
      ['localhost', 'GET'],
      ['127.0.0.1', 'HEAD'],
    ])(
      'sends a %s %s for a frame to the same path on the frame port',
      async (host, method) => {
        const response = await request(
          `http://${host}:${PORT}/frames/studio/home/hero.html?theme=dark`,
          null,
          { method },
        )

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(
          `http://${host}:${FRAME_PORT}/frames/studio/home/hero.html?theme=dark`,
        )
      },
    )

    it('serves no frame page on its own port to a write', async () => {
      const response = await request(
        `http://127.0.0.1:${PORT}/frames/studio/home/hero.html`,
        null,
        { method: 'POST' },
      )

      expect(response.status).toBe(404)
    })
  })

  describe('write guard', () => {
    function write(method: string, path: string, origin: string) {
      return request(`http://127.0.0.1:${PORT}${path}`, null, {
        method,
        headers: {
          origin,
          cookie: `${COOKIE}=${KEY}`,
          'content-type': 'application/json',
        },
        body: '{}',
      })
    }

    it('walks every write route the app mounts', () => {
      expect(WRITE_ROUTES.length).toBeGreaterThan(20)
    })

    it.each(WRITE_ROUTES)(
      "refuses %s %s with the board's cookie and the frame port's origin",
      async (method, path) => {
        const response = await write(
          method,
          path,
          `http://127.0.0.1:${FRAME_PORT}`,
        )

        expect(response.status).toBe(401)
      },
    )

    it("lets the board's cookie through with the board's own origin", async () => {
      const response = await write(
        'POST',
        '/api/frames/edit',
        `http://127.0.0.1:${PORT}`,
      )

      expect(response.status).not.toBe(401)
    })
  })

  describe('host guard', () => {
    it('accepts localhost on the bound port', async () => {
      const response = await request(`http://localhost:${PORT}/api/health`)

      expect(response.status).toBe(200)
    })

    it.each([
      ['a foreign host', `http://evil.test:${PORT}/api/health`],
      ['loopback on another port', `http://127.0.0.1:${PORT + 1}/api/health`],
      ['loopback with no port', 'http://localhost/api/health'],
      [
        'a foreign host asking for a frame',
        `http://evil.test:${PORT}/frames/p/page/a.html`,
      ],
      [
        'a foreign host redeeming a ticket',
        `http://evil.test:${PORT}/api/access/redeem?ticket=t`,
      ],
    ])('refuses %s before any route runs', async (_case, url) => {
      const response = await request(url)

      expect(response.status).toBe(403)
    })
  })
})
