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
  captureMotionImages,
  compositeBounds,
  compositeImagePath,
  filmstripBounds,
  frameImagePath,
  renderFilmstrip,
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

describe('filmstripBounds', () => {
  it('lays the frames in one row with 40 px around and between them', () => {
    expect(
      filmstripBounds('studio/home/hero', { width: 400, height: 300 }, 4),
    ).toEqual({ width: 1800, height: 380 })
  })

  it('accepts a filmstrip exactly 16384 px wide', () => {
    expect(
      filmstripBounds('studio/home/hero', { width: 4046, height: 10 }, 4).width,
    ).toBe(16384)
  })

  it('refuses capture-too-large, exit 10, one pixel past the limit', () => {
    expect(() =>
      filmstripBounds('studio/home/hero', { width: 4047, height: 10 }, 4),
    ).toThrow(
      expect.objectContaining({
        code: 'capture-too-large',
        exitCode: 10,
        details: expect.objectContaining({ width: 16388 }),
      }),
    )
  })

  it('refuses a filmstrip passing the limit only at its scale', () => {
    expect(() =>
      filmstripBounds('studio/home/hero', { width: 2100, height: 10 }, 4, 2),
    ).toThrow(expect.objectContaining({ code: 'capture-too-large' }))
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

  it('names a timed image with its moment ahead of the theme', () => {
    expect(
      frameImagePath('/out', frame, 'light', 1, undefined, undefined, {
        at: 1000,
      }),
    ).toBe('/out/studio/home/hero.at-1000.light.png')
  })

  it('names a linked width ahead of the moment, theme, and scale', () => {
    expect(
      frameImagePath('/out', frame, 'dark', 2, undefined, 390, { at: 250 }),
    ).toBe('/out/studio/home/hero@390.at-250.dark@2x.png')
  })

  it('names a filmstrip with its frame count', () => {
    expect(
      frameImagePath('/out', frame, 'light', 1, undefined, undefined, {
        filmstrip: 4,
      }),
    ).toBe('/out/studio/home/hero.filmstrip-4.light.png')
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

// A red box sliding right across a white page over 2 s, so the column of its
// left edge names the moment a shot holds.
// canon-allow-embedded: the page whose slide the timed capture assertions hold, kept beside them
const SLIDE_PAGE = `<!doctype html><html lang="en"><head><title>slide</title><style>
  @keyframes slide { from { transform: translateX(0) } to { transform: translateX(200px) } }
  body { margin: 0; background: #fff }
  #box { width: 20px; height: 20px; background: #f00; animation: slide 2s linear forwards }
</style></head><body><div id="box"></div></body></html>`

describe.skipIf(shell === null)(
  'captureMotionImages',
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

    async function shoot(timing: { at: number[] } | { filmstrip: number }) {
      board = writeBoard({ 'studio/home/slide.html': SLIDE_PAGE })
      out = mkdtempSync(join(tmpdir(), 'frameboard-shots-'))
      const host = await startFrameHost({ root: board.root, facesDir: out })
      try {
        return await captureMotionImages(browser, {
          baseUrl: host.url,
          frame: frameOf('slide', {
            box: { x: 0, y: 0, width: 300, height: 40 },
          }),
          themes: ['light'],
          out,
          timing,
        })
      } finally {
        await host.close()
      }
    }

    /** The first column on the shot's top row holding red. */
    function redColumn(path: string, from = 0): number {
      const { data, width } = PNG.sync.read(readFileSync(path))
      for (let x = from; x < width; x += 1) {
        if (data[x * 4] === 255 && data[x * 4 + 1] === 0) return x
      }
      return -1
    }

    it('writes one image per moment, each holding its moment', async () => {
      const { images, motion } = await shoot({ at: [0, 1000, 2000] })

      expect(motion).toEqual({ source: 'css', duration: 2000 })
      expect(
        images.map(({ path, at }) => [path.slice(out.length), at]),
      ).toEqual([
        ['/studio/home/slide.at-0.light.png', 0],
        ['/studio/home/slide.at-1000.light.png', 1000],
        ['/studio/home/slide.at-2000.light.png', 2000],
      ])
      expect(images.map(({ path }) => redColumn(path))).toEqual([0, 100, 200])
    })

    it('names a moment past the end as asked and records the end it held', async () => {
      const { images } = await shoot({ at: [5000] })

      expect(images[0]?.path).toMatch(/slide\.at-5000\.light\.png$/)
      expect(images[0]?.at).toBe(2000)
    })

    it('writes a filmstrip of evenly spaced moments in one row', async () => {
      const { images } = await shoot({ filmstrip: 3 })
      const [strip] = images
      if (!strip) throw new Error('No filmstrip captured.')
      const { width, height } = PNG.sync.read(readFileSync(strip.path))

      expect(strip).toMatchObject({ width: 1060, height: 120 })
      expect(strip.moments).toEqual([0, 1000, 2000])
      expect([width, height]).toEqual([1060, 120])
    })
  },
)

describe.skipIf(shell === null)(
  'renderFilmstrip',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let board: TempBoard
    let host: { url: string; close: () => Promise<void> }

    beforeAll(async () => {
      board = writeBoard({ 'studio/home/slide.html': SLIDE_PAGE })
      host = await startFrameHost({ root: board.root, facesDir: board.root })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
    }, SHELL_HOOK_TIMEOUT_MS)

    it('lays the moments in one row at the scale asked', async () => {
      const strip = await renderFilmstrip(requireShell(shell), {
        baseUrl: host.url,
        frame: { ref: 'studio/home/slide', box: { width: 300, height: 40 } },
        theme: 'dark',
        scale: 2,
        count: 4,
      })
      const png = PNG.sync.read(strip.bytes)

      expect(strip).toMatchObject({
        width: 1400,
        height: 120,
        moments: [0, 667, 1333, 2000],
        motion: { source: 'css', duration: 2000 },
      })
      expect([png.width, png.height]).toEqual([2800, 240])
    })

    it('refuses a strip past the screenshot limit as capture-too-large', async () => {
      await expect(
        renderFilmstrip(requireShell(shell), {
          baseUrl: host.url,
          frame: { ref: 'studio/home/slide', box: { width: 4000, height: 40 } },
          theme: 'light',
          count: 5,
        }),
      ).rejects.toMatchObject({ code: 'capture-too-large' })
    })
  },
)
