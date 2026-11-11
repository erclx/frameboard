import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { lookRoutes } from './look'

describe('lookRoutes', () => {
  let parent: string
  let facesDir: string
  let sheet: string | null

  beforeEach(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-look-')))
    facesDir = join(parent, 'faces')
    mkdirSync(join(facesDir, 'geist/files'), { recursive: true })
    writeFileSync(join(facesDir, 'geist/index.css'), '@font-face {}')
    writeFileSync(join(facesDir, 'geist/files/latin.woff2'), 'woff2')
    writeFileSync(join(facesDir, 'geist/LICENSE'), 'license')
    writeFileSync(join(parent, 'secret.css'), 'secret')
    sheet = null
  })

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true })
  })

  function get(path: string) {
    return lookRoutes({ facesDir, boardSheet: () => sheet }).request(path)
  }

  it("serves a face's sheet as css that is never cached", async () => {
    const response = await get('/frameboard/faces/geist/index.css')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('@font-face {}')
  })

  it("serves a face's sheet under the running release as immutable", async () => {
    const response = await get(`/frameboard/faces/v${version}/geist/index.css`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(await response.text()).toBe('@font-face {}')
  })

  it("serves a face's woff2 file under the running release", async () => {
    const response = await get(
      `/frameboard/faces/v${version}/geist/files/latin.woff2`,
    )

    expect(response.headers.get('content-type')).toBe('font/woff2')
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(await response.text()).toBe('woff2')
  })

  it('answers 404 for a face under any other release', async () => {
    const response = await get('/frameboard/faces/v0.0.0/geist/index.css')

    expect(response.status).toBe(404)
  })

  it("serves a face's woff2 file", async () => {
    const response = await get('/frameboard/faces/geist/files/latin.woff2')

    expect(response.headers.get('content-type')).toBe('font/woff2')
    expect(await response.text()).toBe('woff2')
  })

  it('serves the board sheet the server resolved', async () => {
    sheet = join(parent, 'brand.css')
    writeFileSync(sheet, ':root { --fg: teal }')

    const response = await get('/frameboard/tokens.css')

    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe(':root { --fg: teal }')
  })

  it('answers 404 for the board sheet when there is none', async () => {
    const response = await get('/frameboard/tokens.css')

    expect(response.status).toBe(404)
  })

  describe('refusals', () => {
    it.each([
      [
        'a face file that is neither css nor woff2',
        '/frameboard/faces/geist/LICENSE',
      ],
      ['a missing face file', '/frameboard/faces/geist/missing.css'],
      ['a dot-named file', '/frameboard/faces/geist/.hidden.css'],
      [
        'a path leaving the faces folder',
        '/frameboard/faces/%2e%2e/secret.css',
      ],
      ['an encoded slash', '/frameboard/faces/..%2fsecret.css'],
      ['the faces folder itself', '/frameboard/faces/geist'],
      [
        'a path leaving the release folder',
        `/frameboard/faces/v${version}/%2e%2e/secret.css`,
      ],
    ])('refuses %s', async (_case, path) => {
      writeFileSync(join(facesDir, 'geist/.hidden.css'), 'hidden')

      const response = await get(path)

      expect(response.status).toBe(404)
    })

    it('refuses a symlink that leaves the faces folder', async () => {
      symlinkSync(join(parent, 'secret.css'), join(facesDir, 'geist/leak.css'))

      const response = await get('/frameboard/faces/geist/leak.css')

      expect(response.status).toBe(404)
    })
  })
})
