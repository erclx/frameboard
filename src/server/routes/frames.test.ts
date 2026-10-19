import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tokenSheetPaths } from '@/server/checks/tokens'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { frameRoutes } from './frames'

describe('frameRoutes', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
    mkdirSync(join(board.root, '.run'))
    writeFileSync(join(board.root, '.run/address.json'), '{"token":"secret"}')
  })

  afterEach(() => {
    board.cleanup()
  })

  function get(path: string) {
    return frameRoutes(board.root, {
      sheets: (project) => tokenSheetPaths(board.root, project, null),
    }).request(path)
  }

  it('serves a frame file as html that is never cached', async () => {
    const response = await get('/frames/studio/home/hero.html')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toContain('<h1>Studio</h1>')
  })

  it('serves a stylesheet beside the frame in its page folder', async () => {
    const response = await get('/frames/studio/home/styles.css')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it("serves a file from the project's assets folder", async () => {
    const response = await get('/frames/studio/assets/dot.svg')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('decodes each segment of the path', async () => {
    writeFileSync(join(board.root, 'studio/home/two words.html'), '<p>two</p>')

    const response = await get('/frames/studio/home/two%20words.html')

    expect(await response.text()).toMatch(/<\/script><p>two<\/p>$/)
  })

  it('answers 404 for a file that does not exist', async () => {
    const response = await get('/frames/studio/home/missing.html')

    expect(response.status).toBe(404)
  })

  describe('the injected look', () => {
    function frameFile(path: string): string {
      return readFileSync(join(board.root, path), 'utf8')
    }

    it("splices the look first into the frame's head and keeps every other byte", async () => {
      const response = await get('/frames/studio/home/hero.html')

      const served = await response.text()
      const head = /<style data-frameboard>.*?<\/script>/s.exec(served)?.[0]
      expect(head).toBeDefined()
      expect(served.indexOf(head ?? '')).toBe(
        served.indexOf('<head>') + '<head>'.length,
      )
      expect(served.replace(head ?? '', '')).toBe(
        frameFile('studio/home/hero.html'),
      )
    })

    it('imports every face, then the board sheet, then the project sheet', async () => {
      writeFileSync(join(board.root, 'tokens.css'), ':root { --fg: black }')
      writeFileSync(
        join(board.root, 'studio/tokens.css'),
        ':root { --fg: navy }',
      )

      const served = await (await get('/frames/studio/home/hero.html')).text()

      expect(importsOf(served)).toEqual([
        '/frameboard/faces/geist/index.css',
        '/frameboard/faces/geist-mono/index.css',
        '/frameboard/faces/caveat/index.css',
        '/frameboard/tokens.css',
        '/frames/studio/tokens.css',
      ])
    })

    it('imports no token sheet that does not exist', async () => {
      const served = await (await get('/frames/studio/home/hero.html')).text()

      expect(importsOf(served)).not.toContain('/frameboard/tokens.css')
      expect(importsOf(served)).not.toContain('/frames/studio/tokens.css')
    })

    it.each([
      ['a stylesheet in a page folder', 'studio/home/styles.css'],
      ['an svg in the assets folder', 'studio/assets/dot.svg'],
    ])('serves %s byte for byte', async (_case, path) => {
      const response = await get(`/frames/${path}`)

      expect(await response.text()).toBe(frameFile(path))
    })

    it('serves an html file in the assets folder byte for byte', async () => {
      writeFileSync(join(board.root, 'studio/assets/embed.html'), '<p>e</p>')

      const response = await get('/frames/studio/assets/embed.html')

      expect(await response.text()).toBe('<p>e</p>')
    })

    it("serves the project's token sheet as css", async () => {
      writeFileSync(
        join(board.root, 'studio/tokens.css'),
        ':root { --fg: navy }',
      )

      const response = await get('/frames/studio/tokens.css')

      expect(response.headers.get('content-type')).toBe(
        'text/css; charset=utf-8',
      )
      expect(await response.text()).toBe(':root { --fg: navy }')
    })

    it('answers 404 for a project token sheet that does not exist', async () => {
      const response = await get('/frames/studio/tokens.css')

      expect(response.status).toBe(404)
    })

    it('serves a frame in a page named tokens', async () => {
      mkdirSync(join(board.root, 'studio/tokens'))
      writeFileSync(join(board.root, 'studio/tokens/swatch.html'), '<p>s</p>')

      const response = await get('/frames/studio/tokens/swatch.html')

      expect(await response.text()).toContain('<p>s</p>')
    })
  })

  describe('refusals', () => {
    it.each([
      ['a layout file', '/frames/studio/home/layout.json'],
      ['a notes file', '/frames/studio/home/notes.json'],
      ['the project file', '/frames/studio/project.json'],
      [
        'the address file through dot segments',
        '/frames/studio/home/../../.run/address.json',
      ],
      [
        'the address file through encoded dot segments',
        '/frames/studio/home/%2e%2e/%2e%2e/.run/address.json',
      ],
      [
        'an encoded slash inside a segment',
        '/frames/studio/home/..%2f..%2f.run%2faddress.json',
      ],
      ['a dot-named project', '/frames/.run/address.json'],
      ['a dot-named file', '/frames/studio/home/.hidden.html'],
      ['a nested path inside a page', '/frames/studio/home/deep/hero.html'],
    ])('refuses %s', async (_case, path) => {
      writeFileSync(join(board.root, 'studio/home/.hidden.html'), 'hidden')

      const response = await get(path)

      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('secret')
    })

    it('refuses a symlink that leaves the project', async () => {
      symlinkSync(
        join(board.root, '.run/address.json'),
        join(board.root, 'studio/home/leak.html'),
      )

      const response = await get('/frames/studio/home/leak.html')

      expect(response.status).toBe(404)
    })

    it('refuses a project folder that is a symlink out of the board', async () => {
      const outside = join(board.root, '../outside')
      mkdirSync(join(outside, 'assets'), { recursive: true })
      writeFileSync(join(outside, 'assets/secret.txt'), 'secret')
      symlinkSync(outside, join(board.root, 'escape'))

      const response = await get('/frames/escape/assets/secret.txt')

      expect(response.status).toBe(404)
    })

    it('refuses a project token sheet that is a symlink out of the project', async () => {
      symlinkSync(
        join(board.root, '.run/address.json'),
        join(board.root, 'studio/tokens.css'),
      )

      const response = await get('/frames/studio/tokens.css')

      expect(response.status).toBe(404)
    })
  })
})

function importsOf(html: string): string[] {
  return [...html.matchAll(/@import url\("([^"]+)"\)/g)].map(
    (match) => match[1] ?? '',
  )
}
