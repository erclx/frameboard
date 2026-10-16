import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
    return frameRoutes(board.root).request(path)
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

    expect(await response.text()).toBe('<p>two</p>')
  })

  it('answers 404 for a file that does not exist', async () => {
    const response = await get('/frames/studio/home/missing.html')

    expect(response.status).toBe(404)
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
  })
})
