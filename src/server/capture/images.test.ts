import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser } from 'playwright-core'
import { PNG } from 'pngjs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { frameOf } from '../../test/board'
import { startFrameHost } from './host'
import {
  captureFrameImages,
  compositeBounds,
  compositeImagePath,
  frameImagePath,
} from './images'

const PAGE = { ref: 'studio/home', project: 'studio', name: 'home' }

function at(x: number, y: number, width: number, height: number) {
  return { box: { x, y, width, height } }
}

describe('compositeBounds', () => {
  it('shifts the topmost and leftmost frames 40 px in, with 40 px past the far edges', () => {
    const bounds = compositeBounds(PAGE, [
      at(100, 50, 400, 300),
      at(580, 170, 320, 200),
    ])

    expect(bounds).toEqual({ width: 880, height: 400, dx: -60, dy: -10 })
  })

  it('places frames at negative board positions inside the image', () => {
    const bounds = compositeBounds(PAGE, [at(-200, -100, 100, 100)])

    expect(bounds).toEqual({ width: 180, height: 180, dx: 240, dy: 140 })
  })

  it('grows to hold the linked widths each frame draws', () => {
    const bounds = compositeBounds(PAGE, [
      {
        box: { x: 0, y: 0, width: 400, height: 300 },
        widths: [{ width: 200, height: 500 }],
      },
    ])

    expect(bounds).toEqual({ width: 760, height: 580, dx: 40, dy: 40 })
  })

  it('accepts a composite exactly 16384 px wide', () => {
    expect(compositeBounds(PAGE, [at(0, 0, 16304, 10)]).width).toBe(16384)
  })

  it('refuses a composite whose side passes the limit only at its scale', () => {
    expect(() => compositeBounds(PAGE, [at(0, 0, 8153, 10)], 2)).toThrow(
      expect.objectContaining({ code: 'capture-too-large' }),
    )
  })

  it('refuses capture-too-large, exit 10, one pixel past the limit', () => {
    let refusal: unknown
    try {
      compositeBounds(PAGE, [at(0, 0, 10, 16305)])
    } catch (error) {
      refusal = error
    }

    expect(refusal).toBeInstanceOf(FrameboardError)
    expect(refusal).toMatchObject({
      code: 'capture-too-large',
      exitCode: 10,
      details: { ref: 'studio/home', width: 90, height: 16385 },
    })
  })
})

describe('image paths', () => {
  const frame = { project: 'studio', page: 'home', name: 'hero' }

  it('names a 1x frame image with no scale suffix', () => {
    expect(frameImagePath('/out', frame, 'light', 1)).toBe(
      '/out/studio/home/hero.light.png',
    )
  })

  it('names a scaled frame image with its scale', () => {
    expect(frameImagePath('/out', frame, 'dark', 3)).toBe(
      '/out/studio/home/hero.dark@3x.png',
    )
  })

  it('names a scrolled frame image with its offset ahead of the theme', () => {
    expect(frameImagePath('/out', frame, 'light', 1, 1200)).toBe(
      '/out/studio/home/hero.scroll-1200.light.png',
    )
  })

  it('names a scrolled image at a scale with both', () => {
    expect(frameImagePath('/out', frame, 'dark', 2, 1200)).toBe(
      '/out/studio/home/hero.scroll-1200.dark@2x.png',
    )
  })

  it('names a linked width ahead of its offset, theme, and scale', () => {
    expect(frameImagePath('/out', frame, 'dark', 2, 1200, 390)).toBe(
      '/out/studio/home/hero@390.scroll-1200.dark@2x.png',
    )
  })

  it('names a scaled composite with its scale', () => {
    expect(compositeImagePath('/out', PAGE, 'light', 2)).toBe(
      '/out/studio/home.light@2x.png',
    )
  })
})

// A blue band, then a red header sticking to the top, then a long white page,
// 3150 px in all, so a shot at the top shows blue and one past 100 shows red.
const STICKY_PAGE = `<!doctype html><html lang="en"><head><title>hero</title><style>body { margin: 0 } .band { height: 100px; background: #00f } header { position: sticky; top: 0; height: 50px; background: #f00 } .rest { height: 3000px; background: #fff }</style></head><body><div class="band"></div><header></header><div class="rest"></div></body></html>`

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'captureFrameImages with a scroll offset',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let board: TempBoard
    let out: string

    beforeAll(() => {
      browser = requireShell(shell)
    }, SHELL_HOOK_TIMEOUT_MS)

    afterEach(() => {
      board.cleanup()
      rmSync(out, { recursive: true, force: true })
    })

    async function shoot(scroll: number) {
      board = writeBoard({ 'studio/home/hero.html': STICKY_PAGE })
      out = mkdtempSync(join(tmpdir(), 'frameboard-shots-'))
      const host = await startFrameHost({ root: board.root, facesDir: out })
      try {
        const [image] = await captureFrameImages(browser, {
          baseUrl: host.url,
          frames: [
            frameOf('hero', { box: { x: 0, y: 0, width: 400, height: 300 } }),
          ],
          themes: ['light'],
          out,
          scroll,
        })
        if (!image) throw new Error('No image captured.')
        return image
      } finally {
        await host.close()
      }
    }

    /** The color of the shot's top left pixel, as `#rrggbb`. */
    function topLeft(path: string): string {
      const { data } = PNG.sync.read(readFileSync(path))
      return `#${[...data.subarray(0, 3)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    }

    it('holds a sticky header at the top at 1200', async () => {
      const image = await shoot(1200)

      expect(image).toMatchObject({ scrollY: 1200 })
      expect(topLeft(image.path)).toBe('#ff0000')
    })

    it('clamps an offset past the page end and records the offset reached', async () => {
      const image = await shoot(9000)

      expect(image.scrollY).toBe(2850)
      expect(image.path).toMatch(/hero\.scroll-9000\.light\.png$/)
    })
  },
)

// A page whose background follows its width, so each shot names the width
// it was rendered at by its color.
const WIDE_PAGE = `<!doctype html><html lang="en"><head><title>hero</title><style>body { margin: 0; height: 100vh; background: #00f } @media (max-width: 500px) { body { background: #f00 } }</style></head><body></body></html>`

describe.skipIf(shell === null)(
  'captureFrameImages at linked widths',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let board: TempBoard
    let out: string

    beforeAll(() => {
      browser = requireShell(shell)
    }, SHELL_HOOK_TIMEOUT_MS)

    afterEach(() => {
      board.cleanup()
      rmSync(out, { recursive: true, force: true })
    })

    async function shoot(width?: number) {
      board = writeBoard({ 'studio/home/hero.html': WIDE_PAGE })
      out = mkdtempSync(join(tmpdir(), 'frameboard-shots-'))
      const host = await startFrameHost({ root: board.root, facesDir: out })
      try {
        return await captureFrameImages(browser, {
          baseUrl: host.url,
          frames: [
            frameOf('hero', {
              box: { x: 0, y: 0, width: 800, height: 300 },
              widths: [{ width: 390, height: 600 }],
            }),
          ],
          themes: ['light', 'dark'],
          out,
          width,
        })
      } finally {
        await host.close()
      }
    }

    function topLeft(path: string): string {
      const { data } = PNG.sync.read(readFileSync(path))
      return `#${[...data.subarray(0, 3)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    }

    it('writes the frame and each linked width in each theme, named by width', async () => {
      const images = await shoot()

      expect(
        images.map(({ path, width, height }) => [
          path.slice(out.length),
          width,
          height,
        ]),
      ).toEqual([
        ['/studio/home/hero.light.png', 800, 300],
        ['/studio/home/hero.dark.png', 800, 300],
        ['/studio/home/hero@390.light.png', 390, 600],
        ['/studio/home/hero@390.dark.png', 390, 600],
      ])
    })

    it('renders a linked width at that width', async () => {
      const images = await shoot()

      expect(images.map(({ path }) => topLeft(path))).toEqual([
        '#0000ff',
        '#0000ff',
        '#ff0000',
        '#ff0000',
      ])
    })

    it('shoots the one width named alone', async () => {
      const images = await shoot(390)

      expect(images.map(({ width, theme }) => [width, theme])).toEqual([
        [390, 'light'],
        [390, 'dark'],
      ])
    })
  },
)
