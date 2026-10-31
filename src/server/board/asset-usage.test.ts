import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { createAssetUsage } from './asset-usage'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The usage of project `site`, with `files` written into the board. */
async function countsOf(files: Record<string, string>) {
  board = writeBoard({ 'site/assets/.keep': '', ...files })
  return createAssetUsage(board.root).counts('site')
}

describe('createAssetUsage', () => {
  it('counts a frame once however many times it links a file', async () => {
    const counts = await countsOf({
      'site/home/hero.html':
        '<img src="../assets/icons/star.svg"><div style="background: url(../assets/icons/star.svg)"></div>',
    })

    expect(counts.get('icons/star.svg')).toBe(1)
  })

  it('counts each frame linking a file, across pages', async () => {
    const counts = await countsOf({
      'site/home/hero.html': '<img src="../assets/logo.svg">',
      'site/home/footer.html': '<img src="../assets/logo.svg">',
      'site/about/team.html': '<img src="../assets/logo.svg">',
    })

    expect(counts.get('logo.svg')).toBe(3)
  })

  it('counts a file named only in a srcset', async () => {
    const counts = await countsOf({
      'site/home/hero.html':
        '<img srcset="../assets/photo.jpg 1x, ../assets/photo@2x.jpg 2x">',
    })

    expect(counts.get('photo@2x.jpg')).toBe(1)
  })

  it('counts a file a frame stylesheet loads through url()', async () => {
    const counts = await countsOf({
      'site/home/hero.html':
        '<style>@font-face { font-family: Brand; src: url(../assets/brand.woff2) }</style>',
    })

    expect(counts.get('brand.woff2')).toBe(1)
  })

  it('counts a percent-encoded link under its decoded path', async () => {
    const counts = await countsOf({
      'site/home/hero.html': '<img src="../assets/Hero%20Image.png">',
    })

    expect(counts.get('Hero Image.png')).toBe(1)
  })

  it('counts nothing for a network link or a file outside assets/', async () => {
    const counts = await countsOf({
      'site/home/hero.html':
        '<img src="https://example.com/logo.svg"><img src="local.png"><img src="../other/x.png">',
    })

    expect([...counts]).toEqual([])
  })

  it('answers no counts for a project with no frames', async () => {
    const counts = await countsOf({})

    expect([...counts]).toEqual([])
  })

  describe('caching', () => {
    it('answers a repeat read from the cache until a batch drops it', async () => {
      board = writeBoard({
        'site/home/hero.html': '<img src="../assets/logo.svg">',
      })
      const usage = createAssetUsage(board.root)
      await usage.counts('site')
      writeFileSync(
        join(board.root, 'site/home/footer.html'),
        '<img src="../assets/logo.svg">',
      )

      const cached = await usage.counts('site')
      usage.drop([join(board.root, 'site/home/footer.html')])
      const fresh = await usage.counts('site')

      expect(cached.get('logo.svg')).toBe(1)
      expect(fresh.get('logo.svg')).toBe(2)
    })

    it('keeps a project cached through a batch under another project', async () => {
      board = writeBoard({
        'site/home/hero.html': '<img src="../assets/logo.svg">',
        'shop/home/cart.html': '',
      })
      const usage = createAssetUsage(board.root)
      await usage.counts('site')
      writeFileSync(
        join(board.root, 'site/home/footer.html'),
        '<img src="../assets/logo.svg">',
      )

      usage.drop([join(board.root, 'shop/home/cart.html')])

      expect((await usage.counts('site')).get('logo.svg')).toBe(1)
    })
  })
})
