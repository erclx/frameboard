import { afterEach, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/checks/frame-source'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { frameAssets } from './assets'

describe('frameAssets', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function assetsOf(html: string, files: Record<string, string> = {}) {
    board = writeBoard({ 'studio/home/hero.html': html, ...files })
    return frameAssets(
      readFrame({
        root: board.root,
        project: 'studio',
        page: 'home',
        name: 'hero',
      }),
    )
  }

  it('should yield a linked sheet and the font the sheet loads', () => {
    expect(
      assetsOf('<link rel="stylesheet" href="../assets/kit/kit.css">', {
        'studio/assets/kit/kit.css':
          '@font-face { src: url("vendor/face.woff2") }',
        'studio/assets/kit/vendor/face.woff2': 'font',
        'studio/assets/kit/unused.css': '',
      }),
    ).toEqual(['kit/kit.css', 'kit/vendor/face.woff2'])
  })

  it('should list a file two elements load once', () => {
    expect(
      assetsOf(
        '<img src="../assets/a.png"><img src="../assets/a.png" alt="again">',
        { 'studio/assets/a.png': 'png' },
      ),
    ).toEqual(['a.png'])
  })

  it('should yield nothing for a link outside the project assets', () => {
    expect(
      assetsOf(
        '<img src="beside.png"><img src="../other/x.png"><img src="https://example.com/y.png">',
        {
          'studio/home/beside.png': 'png',
          'studio/other/x.png': 'png',
        },
      ),
    ).toEqual([])
  })

  it('should yield nothing for a code sample naming an asset', () => {
    expect(
      assetsOf('<code>../assets/a.png</code>', {
        'studio/assets/a.png': 'png',
      }),
    ).toEqual([])
  })

  it('should skip a load naming no file', () => {
    expect(
      assetsOf('<img src="../assets/gone.png"><img src="../assets/">', {
        'studio/assets/a.png': 'png',
      }),
    ).toEqual([])
  })
})
