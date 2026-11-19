import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { frameOriginApp, startFrameOrigin } from './listener'

const PORT = 47123
const ORIGIN = `http://127.0.0.1:${PORT}`

describe('frameOriginApp', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
    writeFileSync(join(board.root, 'studio/tokens.css'), ':root { --a: 1 }\n')
  })

  afterEach(() => {
    board.cleanup()
  })

  function request(path: string, init?: RequestInit) {
    return frameOriginApp(() => PORT, {
      root: board.root,
      facesDir: join(board.root, '..', 'faces'),
    }).request(`${ORIGIN}${path}`, init)
  }

  describe('what it serves', () => {
    it('serves a frame page with its sheets imported', async () => {
      const response = await request('/frames/studio/home/hero.html')

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('<h1>Studio</h1>')
      expect(html).toContain('@import url("/frames/studio/tokens.css")')
    })

    it("serves a project's asset", async () => {
      const response = await request('/frames/studio/assets/dot.svg')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/svg+xml')
    })

    it("serves a project's token sheet", async () => {
      const response = await request('/frames/studio/tokens.css')

      expect(await response.text()).toBe(':root { --a: 1 }\n')
    })

    it('lets a frame page sit only in a loopback page', async () => {
      const response = await request('/frames/studio/home/hero.html')

      expect(response.headers.get('content-security-policy')).toBe(
        "frame-ancestors 'self' http://127.0.0.1:* http://localhost:*",
      )
    })
  })

  describe('what it refuses', () => {
    it.each([
      ['a read route', '/api/health', 'GET'],
      ['a write route', '/api/frames/edit', 'POST'],
      ['the board client', '/index.html', 'GET'],
      ['a write to a frame path', '/frames/studio/home/hero.html', 'PUT'],
    ])('answers 404 for %s', async (_case, path, method) => {
      const response = await request(path, { method })

      expect(response.status).toBe(404)
    })

    it('answers 403 to a host other than its own loopback port', async () => {
      const response = await frameOriginApp(() => PORT, {
        root: board.root,
        facesDir: board.root,
      }).request('http://evil.test/frames/studio/home/hero.html', {
        headers: { host: 'evil.test' },
      })

      expect(response.status).toBe(403)
    })
  })

  describe('cross-origin reads', () => {
    it.each([
      ['the board on 127.0.0.1', 'http://127.0.0.1:4321'],
      ['the board on localhost', 'http://localhost:5173'],
    ])('lets %s read a file', async (_case, origin) => {
      const response = await request('/frames/studio/assets/dot.svg', {
        headers: { origin },
      })

      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      expect(response.headers.get('access-control-allow-credentials')).toBe(
        null,
      )
    })

    it.each([
      ['a foreign host', 'http://evil.test'],
      ['an opaque origin', 'null'],
      ['a loopback name over https', 'https://localhost:4321'],
    ])('lets %s read nothing', async (_case, origin) => {
      const response = await request('/frames/studio/assets/dot.svg', {
        headers: { origin },
      })

      expect(response.headers.get('access-control-allow-origin')).toBe(null)
    })
  })
})

describe('startFrameOrigin', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  it('serves a frame on a free loopback port until closed', async () => {
    const origin = await startFrameOrigin({
      root: board.root,
      facesDir: board.root,
    })
    const url = `http://127.0.0.1:${origin.port}/frames/studio/home/hero.html`

    const response = await fetch(url)
    await origin.close()

    expect(response.status).toBe(200)
    await expect(fetch(url)).rejects.toThrow()
  })
})
