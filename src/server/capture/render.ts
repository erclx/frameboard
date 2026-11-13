import type { Browser, Page } from 'playwright-core'

import { MAX_COMPOSITE_SIDE } from '@/shared/capture-limits'
import { FrameboardError } from '@/shared/errors'
import {
  BEZEL_COLORS,
  bezelBox,
  BEZELS,
  bezelShadow,
  type Device,
  HOME_BAR,
  PHONE_ISLAND,
} from '@/shared/frame-device'
import { frameThemeUrl, type Theme } from '@/shared/theme'

import { settleAnimations } from './animation-settle'
import { assertFontsPresent } from './fonts'
import { settleImages } from './image-loads'
import { holdAnimationClock } from './seek'

/** How long a frame has to load, its faces and images included, before its capture fails. */
export const LOAD_TIMEOUT_MS = 10_000
export { MAX_COMPOSITE_SIDE } from '@/shared/capture-limits'

export interface OpenFrameOptions {
  /** The origin serving `/frames/`, a frame host or the board server. */
  baseUrl: string
  ref: string
  /** The viewport, being the frame's layout size. */
  box: { width: number; height: number }
  theme: Theme
  /** Device pixels per CSS pixel, 1 for a capture. */
  scale?: number
  /**
   * `require` refuses a frame whose face or image is missing, so a capture
   * never shows a fallback as the design. `wait` loads it as the board shows
   * it, for a reading of what the board renders.
   */
  fonts?: 'require' | 'wait'
  /** The load budget in milliseconds, 10 s unless a test asks for less. */
  timeoutMs?: number
  /**
   * `settle` waits for finite animations to end, the default. `hold` stops
   * the page's animation clock before it loads, so a seeked shot finds every
   * animation still listed at its start, a short unfilled entrance included.
   */
  motion?: 'settle' | 'hold'
}

export interface OpenFrame {
  page: Page
  close: () => Promise<void>
}

/**
 * Loads a frame in its own browser context at its layout size, in the theme
 * asked for, and resolves once it has loaded, its faces have settled, and its
 * images have decoded, all inside one load budget. Under `fonts: 'require'`,
 * the default, a missing face refuses `font-missing`, an image that failed or
 * outran the budget refuses `image-missing`, and either closes the context.
 * It then waits, on what is left of the budget, for running animations with
 * a finite end to finish, and never refuses for one, unless `motion` is `hold`.
 */
export async function openFrame(
  browser: Browser,
  {
    baseUrl,
    ref,
    box,
    theme,
    scale = 1,
    fonts = 'require',
    timeoutMs = LOAD_TIMEOUT_MS,
    motion = 'settle',
  }: OpenFrameOptions,
): Promise<OpenFrame> {
  const context = await browser.newContext({
    viewport: { width: box.width, height: box.height },
    deviceScaleFactor: scale,
    colorScheme: theme,
  })
  const close = () => context.close()
  const deadline = Date.now() + timeoutMs
  try {
    const page = await context.newPage()
    if (motion === 'hold') await holdAnimationClock(page)
    // The frame route's injected script sets the root's theme from the URL.
    await page.goto(new URL(frameThemeUrl(ref, theme), baseUrl).href, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })
    // An image whose request hangs holds the load event, so the load wait
    // runs apart from the navigation and a stall can name the image.
    const stalled = await page
      .waitForLoadState('load', { timeout: deadline - Date.now() })
      .then(
        () => null,
        (error: unknown) => error,
      )
    if (stalled !== null) {
      await settleImages(page, ref, fonts, 0, { stalled: true })
      throw stalled
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (fonts === 'require') await assertFontsPresent(page, ref)
    await settleImages(page, ref, fonts, deadline - Date.now())
    // The `wait` readers finish finite animations themselves on every write.
    if (fonts === 'require' && motion === 'settle') {
      await settleAnimations(page, deadline - Date.now())
    }
    return { page, close }
  } catch (error) {
    await close()
    throw error
  }
}

/**
 * Refuses `capture-too-large` for a frame whose screenshot at `scale` would
 * pass Chromium's surface on either side, which would otherwise come back
 * cropped or blank rather than failing.
 */
export function assertScreenshotFits(
  ref: string,
  box: { width: number; height: number },
  scale: number,
): void {
  const width = Math.ceil(box.width * scale)
  const height = Math.ceil(box.height * scale)
  if (width > MAX_COMPOSITE_SIDE || height > MAX_COMPOSITE_SIDE) {
    throw new FrameboardError(
      'capture-too-large',
      `${ref} at ${scale}x would be ${width} by ${height} px, past the ${MAX_COMPOSITE_SIDE} px a browser screenshot holds. Pick a smaller scale.`,
      { ref, width, height, scale, max: MAX_COMPOSITE_SIDE },
    )
  }
}

/**
 * Renders a frame to PNG bytes in a theme, as the server's PNG route asks,
 * at `scale` device pixels per CSS pixel or the renderer's own default. A
 * `device` draws the frame inside that device's body, the PNG growing by
 * the body on every side, its corners past the body transparent.
 */
export type RenderFrame = (
  frame: {
    ref: string
    box: { width: number; height: number }
    device?: Device
  },
  theme: Theme,
  scale?: number,
) => Promise<Buffer>

export interface WarmBrowser {
  /** The browser, launched on the first call and reused after. */
  get: () => Promise<Browser>
  /** Closes the browser, including one still launching, so no Chromium outlives the server. */
  close: () => Promise<void>
}

/**
 * One browser kept warm for a server and shared by everything rendering on
 * it, so the server holds one Chromium. A launch that fails is not kept, so a
 * browser installed later is found on the next call, and every call after
 * `close` refuses.
 */
export function createWarmBrowser(launch: () => Promise<Browser>): WarmBrowser {
  let browser: Promise<Browser> | null = null
  let closed = false

  return {
    get: () => {
      if (closed)
        return Promise.reject(new Error('The board server is closing.'))
      browser ??= launch().catch((error: unknown) => {
        browser = null
        throw error
      })
      return browser
    },
    close: async () => {
      closed = true
      const launched = browser
      browser = null
      await launched?.then((open) => open.close()).catch(() => {})
    },
  }
}

/**
 * Renders on a server's warm browser one frame at a time at `scale`. The
 * queue is the renderer's own, so a PNG never waits behind another consumer
 * of the browser, such as a thumbnail.
 */
export function createWarmRenderer({
  baseUrl,
  browser,
  scale: defaultScale,
}: {
  /** Read per render, since the server's port is known only once listening. */
  baseUrl: () => string
  browser: WarmBrowser
  /** The default device pixels per CSS pixel: 2 for the PNG route, 0.5 for a thumbnail. */
  scale: number
}): RenderFrame {
  // Renders run in turn, so a frame calling the route in a loop costs one tab.
  let queue: Promise<unknown> = Promise.resolve()

  return (frame, theme, scale = defaultScale) => {
    const run = queue.then(async () => {
      assertScreenshotFits(
        frame.ref,
        bezelBox({ x: 0, y: 0, ...frame.box }, frame.device),
        scale,
      )
      const open = await browser.get()
      const opened = await openFrame(open, {
        baseUrl: baseUrl(),
        ref: frame.ref,
        box: frame.box,
        theme,
        scale,
      })
      let shot: Buffer
      try {
        shot = await opened.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
        })
      } finally {
        await opened.close()
      }
      return frame.device
        ? drawBezel(open, shot, frame.box, frame.device, scale)
        : shot
    })
    queue = run.catch(() => {})
    return run
  }
}

/**
 * A frame's shot drawn inside a device's body, as the board draws it, on a
 * page the size of the body, so the PNG holds the body and nothing past it.
 */
async function drawBezel(
  browser: Browser,
  shot: Buffer,
  box: { width: number; height: number },
  device: Device,
  scale: number,
): Promise<Buffer> {
  const { border, screenRadius } = BEZELS[device]
  const outer = bezelBox({ x: 0, y: 0, ...box }, device)
  const context = await browser.newContext({
    viewport: { width: outer.width, height: outer.height },
    deviceScaleFactor: scale,
  })
  try {
    const page = await context.newPage()
    const marks =
      device === 'phone'
        ? `<span style="${pill(PHONE_ISLAND.width, PHONE_ISLAND.height, BEZEL_COLORS.island)}top:${PHONE_ISLAND.top}px"></span>` +
          `<span style="${pill(HOME_BAR.width, HOME_BAR.height, BEZEL_COLORS.homeBar)}bottom:${HOME_BAR.bottom}px"></span>`
        : ''
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<div style="position:absolute;left:${border}px;top:${border}px;width:${box.width}px;height:${box.height}px">` +
        `<img alt="" src="data:image/png;base64,${shot.toString('base64')}" style="display:block;width:100%;height:100%">` +
        `<div style="position:absolute;inset:0;border-radius:${screenRadius}px;box-shadow:${bezelShadow(device, { drop: false })}">${marks}</div>` +
        `</div></body></html>`,
      { waitUntil: 'load' },
    )
    return await page.screenshot({ omitBackground: true, caret: 'hide' })
  } finally {
    await context.close()
  }
}

function pill(width: number, height: number, color: string): string {
  return `position:absolute;left:50%;transform:translateX(-50%);width:${width}px;height:${height}px;border-radius:${height / 2}px;background:${color};`
}
