import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { type FrameHost, startFrameHost } from './host'
import {
  assertScreenshotFits,
  createWarmBrowser,
  createWarmRenderer,
  openFrame,
} from './render'

const FRAME = { ref: 'studio/home/hero', box: { width: 10, height: 10 } }

/** The alpha of a PNG's top left pixel, read by decoding it in a page. */
async function cornerAlpha(browser: Browser, png: Buffer): Promise<number> {
  return (await pixelAt(browser, png, 0, 0))[3] ?? -1
}

/** The red, green, blue, and alpha of one pixel of a PNG. */
async function pixelAt(
  browser: Browser,
  png: Buffer,
  x: number,
  y: number,
): Promise<number[]> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    return await page.evaluate(
      async ({ data, x, y }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const drawn = canvas.getContext('2d')
        drawn?.drawImage(image, 0, 0)
        return [...(drawn?.getImageData(x, y, 1, 1).data ?? [])]
      },
      { data: png.toString('base64'), x, y },
    )
  } finally {
    await context.close()
  }
}

/** A browser whose every context fails to open, recording whether it was closed. */
function stubBrowser() {
  const state = { closed: false }
  const browser = {
    newContext: async () => {
      throw new Error('No context in a stub.')
    },
    close: async () => {
      state.closed = true
    },
  } as unknown as Browser
  return { browser, state }
}

describe('createWarmBrowser', () => {
  it('launches once for every consumer holding it', async () => {
    const { browser } = stubBrowser()
    let launches = 0
    const warm = createWarmBrowser(async () => {
      launches += 1
      return browser
    })
    const render = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      browser: warm,
      scale: 2,
    })

    await Promise.allSettled([render(FRAME, 'light'), warm.get()])

    expect(launches).toBe(1)
  })

  it('launches again after a launch failed', async () => {
    const { browser } = stubBrowser()
    const outcomes = [new Error('No browser.'), browser]
    const warm = createWarmBrowser(async () => {
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error('Launched too often.')
      return next
    })

    await expect(warm.get()).rejects.toThrow('No browser.')
    await expect(warm.get()).resolves.toBe(browser)
  })

  it('closes a browser still launching when the server closes', async () => {
    const { browser, state } = stubBrowser()
    let finishLaunch: (browser: Browser) => void = () => {}
    const warm = createWarmBrowser(
      () =>
        new Promise<Browser>((resolve) => {
          finishLaunch = resolve
        }),
    )

    const launching = warm.get()
    const closing = warm.close()
    finishLaunch(browser)
    await closing
    await launching

    expect(state.closed).toBe(true)
  })

  it('refuses a render once closed', async () => {
    const { browser } = stubBrowser()
    const warm = createWarmBrowser(async () => browser)
    const render = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      browser: warm,
      scale: 2,
    })

    await warm.close()

    await expect(render(FRAME, 'light')).rejects.toThrow('closing')
  })
})

describe('assertScreenshotFits', () => {
  it('passes a frame reaching exactly 16384 device pixels', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 8192, height: 900 }, 2),
    ).not.toThrow()
  })

  it('refuses capture-too-large one device pixel past the limit', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 1440, height: 16385 }, 1),
    ).toThrow(
      expect.objectContaining({
        code: 'capture-too-large',
        details: expect.objectContaining({ ref: FRAME.ref, scale: 1 }),
      }),
    )
  })

  it('names the scale when the scale pushes a frame past the limit', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 1440, height: 6000 }, 3),
    ).toThrow(/at 3x/)
  })
})

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)('openFrame', () => {
  const ref = 'studio/home/hero'
  let browser: Browser
  let host: FrameHost
  let board: TempBoard
  let faces: string

  beforeAll(async () => {
    browser = requireShell(shell)
    faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
    board = writeBoard({
      'studio/home/hero.html':
        '<p style="font-family: \'Not Installed Face\'">Hello</p>',
      'studio/home/layout.json': JSON.stringify({
        version: 1,
        frames: { hero: { x: 0, y: 0, width: 200, height: 100, order: 0 } },
      }),
    })
    host = await startFrameHost({ root: board.root, facesDir: faces })
  }, SHELL_HOOK_TIMEOUT_MS)

  afterAll(async () => {
    await host.close()
    board.cleanup()
    rmSync(faces, { recursive: true, force: true })
  }, SHELL_HOOK_TIMEOUT_MS)

  it('refuses font-missing for a face that is not installed', async () => {
    const opening = openFrame(browser, {
      baseUrl: host.url,
      ref,
      box: { width: 200, height: 100 },
      theme: 'light',
    })

    await expect(opening).rejects.toMatchObject({ code: 'font-missing' })
  })

  it('loads the same frame in its fallback under fonts wait', async () => {
    const opened = await openFrame(browser, {
      baseUrl: host.url,
      ref,
      box: { width: 200, height: 100 },
      theme: 'light',
      fonts: 'wait',
    })
    const text = await opened.page.textContent('p')
    await opened.close()

    expect(text).toBe('Hello')
  })
})

describe.skipIf(shell === null)(
  'createWarmRenderer',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let host: FrameHost
    let board: TempBoard
    let faces: string

    beforeAll(async () => {
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      board = writeBoard({
        'studio/home/hero.html': '<p>Hello</p>',
        // A red line at the page's very top, on a green fill the status bar takes.
        'studio/home/edge.html':
          '<style>body{margin:0;background:rgb(0,128,0)}</style>' +
          '<div style="height:10px;background:rgb(255,0,0)"></div>',
        // The body's red fill would show in the corner of a shot not isolated.
        'studio/home/badge.html':
          '<style>body{margin:0;background:red}</style>' +
          '<span style="display:block;width:60px;height:40px;border-radius:20px;background:blue"></span>',
        // The controls' column would draw blue right of the green photo.
        'studio/home/tuner.html':
          '<style>body{margin:0;background:#fff;display:flex}#photo{width:100px;height:100px;background:#0a0}.controls{width:100px;height:100px;background:#00f}</style>' +
          '<div id="photo"></div><div class="controls"><label>Brightness <input type="range" data-binds="#photo --brightness" data-unit="%"></label></div>',
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    it('answers a PNG at the scale it was made with', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 0.5,
      })

      const bytes = await render(
        { ref: 'studio/home/hero', box: { width: 200, height: 100 } },
        'light',
      )

      // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        100, 50,
      ])
    })

    it('answers a PNG at the scale a call asks for over its default', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 2,
      })

      const bytes = await render(
        { ref: 'studio/home/hero', box: { width: 200, height: 100 } },
        'light',
        3,
      )

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        600, 300,
      ])
    })

    it('grows a PNG by the device body and its buttons and leaves its corners clear', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 200, height: 400 },
          device: 'phone',
        },
        'light',
      )
      const corner = await cornerAlpha(requireShell(shell), bytes)
      // The first volume button, 4 wide past the body's left and 195 down it.
      const button = await pixelAt(requireShell(shell), bytes, 2, 220)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        240, 432,
      ])
      expect(corner).toBe(0)
      expect(button).toEqual([42, 44, 49, 255])
    })

    it("starts a phone page under a status bar in the page's fill, the box still its size", async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 200, height: 400 },
          device: 'phone',
        },
        'light',
      )
      // The body's top is 16 down the PNG, the status bar 54 tall below it.
      const bar = await pixelAt(requireShell(shell), bytes, 120, 16 + 50)
      const line = await pixelAt(requireShell(shell), bytes, 120, 16 + 54 + 5)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        240, 432,
      ])
      expect(bar).toEqual([0, 128, 0, 255])
      expect(line).toEqual([255, 0, 0, 255])
    })

    it('starts a tablet page at its box top', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 600, height: 400 },
          device: 'tablet',
        },
        'light',
      )
      const line = await pixelAt(requireShell(shell), bytes, 300, 38 + 5)

      expect(line).toEqual([255, 0, 0, 255])
    })

    const MARK = [74, 78, 87, 255]
    const LENS = [10, 10, 12, 255]

    it('draws a tablet with its camera and its three buttons whole', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 600, height: 400 },
          device: 'tablet',
        },
        'light',
      )
      const at = (x: number, y: number) =>
        pixelAt(requireShell(shell), bytes, x, y)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        676, 476,
      ])
      expect(await at(340, 24)).toEqual(LENS)
      expect(await at(538, 2)).toEqual(MARK)
      expect(await at(673, 158)).toEqual(MARK)
      expect(await at(673, 233)).toEqual(MARK)
    })

    it('turns a tablet right with its power button on the right and its volume along the bottom', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 800, height: 500 },
          device: 'tablet',
          turn: 'right',
        },
        'light',
      )
      const at = (x: number, y: number) =>
        pixelAt(requireShell(shell), bytes, x, y)

      expect(await at(873, 438)).toEqual(MARK)
      expect(await at(718, 573)).toEqual(MARK)
      expect(await at(643, 573)).toEqual(MARK)
    })

    it('draws a laptop with its camera in the lid', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 1200, height: 700 },
          device: 'laptop',
        },
        'light',
      )

      expect(await pixelAt(requireShell(shell), bytes, 695, 11)).toEqual(LENS)
    })

    it('draws a phone turned left with its page at the top between its strips and the island on its left short side', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 400, height: 200 },
          device: 'phone',
          turn: 'left',
        },
        'light',
      )
      // The body's top is 20 down the PNG, its buttons 4 past the border.
      const line = await pixelAt(requireShell(shell), bytes, 200, 20 + 5)
      // The island's middle, 14 in from the body's left screen edge and 15 into its 30 width.
      const island = await pixelAt(requireShell(shell), bytes, 16 + 29, 120)
      // Past the island's far side in the left strip, and as deep into the right one.
      const left = await pixelAt(requireShell(shell), bytes, 16 + 50, 25)
      const right = await pixelAt(requireShell(shell), bytes, 16 + 350, 25)
      // The page's first column, past the left strip.
      const start = await pixelAt(requireShell(shell), bytes, 16 + 54 + 2, 25)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        432, 240,
      ])
      expect(line).toEqual([255, 0, 0, 255])
      expect(island).toEqual([5, 5, 6, 255])
      expect(left).toEqual([0, 128, 0, 255])
      expect(right).toEqual([0, 128, 0, 255])
      expect(start).toEqual([255, 0, 0, 255])
    })

    it.each([
      ['compact', 255],
      ['wide', 5],
    ] as const)('draws the %s island at its own width', async (island, red) => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 320, height: 568 },
          device: 'phone',
          island,
        },
        'light',
      )
      // Inside the wide island's left end, past the compact one's and the time, on the island's middle line.
      const [shown] = await pixelAt(requireShell(shell), bytes, 125, 45)

      expect(shown).toBe(red)
    })

    it.each([
      ['closed', 466, 678, 253],
      ['open', 890, 626, 687],
    ] as const)(
      'draws a %s foldable 20 past its screen with the island where the pose sets it',
      async (pose, width, height, islandX) => {
        const render = createWarmRenderer({
          baseUrl: () => host.url,
          browser: createWarmBrowser(async () => requireShell(shell)),
          scale: 1,
        })

        const bytes = await render(
          {
            ref: 'studio/home/hero',
            box: { width, height },
            device: 'foldable',
            pose,
          },
          'light',
        )
        // The island's middle, 14 down the screen and 15 into its 30 height.
        const island = await pixelAt(requireShell(shell), bytes, islandX, 49)

        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
          width + 40,
          height + 40,
        ])
        expect(island).toEqual([5, 5, 6, 255])
      },
    )

    it('shades the fold of a half open foldable darker than the open crease', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })
      const frame = {
        ref: 'studio/home/hero',
        box: { width: 890, height: 626 },
        device: 'foldable' as const,
      }

      const half = await render({ ...frame, pose: 'half' }, 'light')
      const open = await render({ ...frame, pose: 'open' }, 'light')
      // Ten left of the fold's middle, where the crease has faded and the shade has not.
      const [shaded] = await pixelAt(requireShell(shell), half, 455, 333)
      const [creased] = await pixelAt(requireShell(shell), open, 455, 333)

      expect(shaded).toBeLessThan(creased ?? 0)
    })

    it('stands a turned open foldable’s island on end a quarter down its left side', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 626, height: 890 },
          device: 'foldable',
          pose: 'open',
          turn: 'left',
        },
        'light',
      )
      // The island's middle, 14 in from the screen's left edge and 15 into its 30 width, a quarter down the 890 tall screen.
      const island = await pixelAt(
        requireShell(shell),
        bytes,
        20 + 29,
        20 + 222,
      )

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        666, 930,
      ])
      expect(island).toEqual([5, 5, 6, 255])
    })

    it('draws a closed foldable turned left with its page between its strips and the island in the left one', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: { width: 678, height: 466 },
          device: 'foldable',
          pose: 'closed',
          turn: 'left',
        },
        'light',
      )
      // The island's middle, 14 in from the screen's left edge and 15 into its 30 width, halfway down.
      const island = await pixelAt(
        requireShell(shell),
        bytes,
        20 + 29,
        20 + 233,
      )
      // Past the island's far side in the left strip, and as deep into the right one.
      const left = await pixelAt(requireShell(shell), bytes, 20 + 50, 20 + 5)
      const right = await pixelAt(requireShell(shell), bytes, 20 + 628, 20 + 5)
      // The page's first column, past the left strip.
      const start = await pixelAt(
        requireShell(shell),
        bytes,
        20 + 54 + 2,
        20 + 5,
      )

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        718, 506,
      ])
      expect(island).toEqual([5, 5, 6, 255])
      expect(left).toEqual([0, 128, 0, 255])
      expect(right).toEqual([0, 128, 0, 255])
      expect(start).toEqual([255, 0, 0, 255])
    })

    it('draws the body around a frame placed away from the canvas origin', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })
      // A frame's record carries its canvas place beside its size, as the PNG route passes it.
      const placed = { x: 1520, y: 40, width: 678, height: 466 }

      const bytes = await render(
        {
          ref: 'studio/home/edge',
          box: placed,
          device: 'foldable',
          pose: 'closed',
          turn: 'left',
        },
        'light',
      )
      const body = await pixelAt(requireShell(shell), bytes, 10, 20 + 233)
      const island = await pixelAt(
        requireShell(shell),
        bytes,
        20 + 29,
        20 + 233,
      )
      const strip = await pixelAt(requireShell(shell), bytes, 20 + 50, 20 + 5)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        718, 506,
      ])
      expect(body).toEqual([23, 24, 27, 255])
      expect(island).toEqual([5, 5, 6, 255])
      expect(strip).toEqual([0, 128, 0, 255])
    })

    it('runs a turned half open foldable’s fold across the screen', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 626, height: 890 },
          device: 'foldable',
          pose: 'half',
          turn: 'right',
        },
        'light',
      )
      // The screen's middle row against a row 200 above it, both halfway across.
      const [fold] = await pixelAt(requireShell(shell), bytes, 333, 20 + 445)
      const [clear] = await pixelAt(requireShell(shell), bytes, 333, 20 + 245)

      expect(fold).toBeLessThan(clear ?? 0)
    })

    it('draws none of a phone page past the body at its screen corner', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 200, height: 400 },
          device: 'phone',
        },
        'light',
      )
      // Inside the screen's square corner yet past the body's outer arc.
      const [, , , alpha] = await pixelAt(requireShell(shell), bytes, 21, 17)

      expect(alpha).toBe(0)
    })

    it('grows a PNG by the laptop body, its base past the lid, and leaves its corners clear', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/hero',
          box: { width: 1024, height: 200 },
          device: 'laptop',
        },
        'light',
      )
      const corner = await cornerAlpha(requireShell(shell), bytes)

      // The base reaches 64 past the 1064 lid, 6% of it, on each side.
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        1024 + 2 * (20 + 64),
        200 + 20 + 28 + 14,
      ])
      expect(corner).toBe(0)
    })

    it('answers one element alone at its own size times the scale, on a clear ground', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 2,
      })

      // Element 4 of the badge frame is its span, past html, head, style, and body.
      const bytes = await render(
        {
          ref: 'studio/home/badge',
          box: { width: 200, height: 100 },
          element: 4,
        },
        'light',
      )
      const corner = await cornerAlpha(requireShell(shell), bytes)

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        120, 80,
      ])
      expect(corner).toBe(0)
    })

    it('hides drawn controls and the column holding them', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        { ref: 'studio/home/tuner', box: { width: 200, height: 100 } },
        'light',
      )

      expect(await pixelAt(requireShell(shell), bytes, 150, 50)).toEqual([
        255, 255, 255, 255,
      ])
      expect(await pixelAt(requireShell(shell), bytes, 50, 50)).toEqual([
        0, 170, 0, 255,
      ])
    })

    it('draws no device around an element', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      const bytes = await render(
        {
          ref: 'studio/home/badge',
          box: { width: 200, height: 100 },
          device: 'phone',
          element: 4,
        },
        'light',
      )

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([60, 40])
    })

    it('refuses an element index naming none as invalid-address', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 1,
      })

      await expect(
        render(
          {
            ref: 'studio/home/badge',
            box: { width: 200, height: 100 },
            element: 40,
          },
          'light',
        ),
      ).rejects.toMatchObject({ code: 'invalid-address' })
    })

    it('refuses a render past the screenshot limit before opening a tab', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 2,
      })

      await expect(
        render(
          { ref: 'studio/home/hero', box: { width: 1440, height: 6000 } },
          'light',
          3,
        ),
      ).rejects.toMatchObject({ code: 'capture-too-large' })
    })
  },
)
