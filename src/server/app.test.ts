import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { createTickets } from './access/tickets'
import { createApp } from './app'

const PORT = 4173

describe('createApp', () => {
  let clientDir: string

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
  })

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true })
  })

  function request(url: string) {
    return createApp({
      clientDir,
      root: '/board',
      port: () => PORT,
      tickets: createTickets(),
      actions: {
        access: {
          token: () => null,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        open: async () => false,
        show: () => 0,
      },
      renderFrame: async () => Buffer.alloc(0),
    }).request(url)
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

  it('answers 404 for an unknown path outside the board routes', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/nowhere`)

    expect(response.status).toBe(404)
  })

  it('answers the health check with the board root', async () => {
    const response = await request(`http://127.0.0.1:${PORT}/api/health`)

    expect(await response.json()).toEqual({ version, root: '/board' })
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
