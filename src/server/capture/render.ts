import type { Browser, Page } from 'playwright-core'

import { HIDE_CONTROLS_CSS } from '@/shared/bindings'
import { MAX_COMPOSITE_SIDE } from '@/shared/capture-limits'
import { FrameboardError } from '@/shared/errors'
import {
  BEZEL_COLORS,
  bezelBox,
  BEZELS,
  bezelShadow,
  type Device,
  FOLDABLE_ISLAND,
  foldBand,
  HOME_BAR,
  islandCenter,
  LAPTOP_BASE,
  laptopParts,
  PHONE_ISLAND,
  type Pose,
  screenCorners,
} from '@/shared/frame-device'
import { frameThemeUrl, LOOK_MARKER, type Theme } from '@/shared/theme'

import { settleAnimations } from './animation-settle'
import { isolateElement } from './element-shot'
import { assertFontsPresent } from './fonts'
import { settleImages } from './image-loads'
import { settleModels, type UnloadedModel } from './model-loads'
import { holdAnimationClock } from './seek'
import { settleVideos, type UnloadedVideo } from './video-loads'

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
  /** The videos a `require` open left with no picture, empty under `wait`. */
  videos: UnloadedVideo[]
  /** The models a `require` open left undrawn, empty under `wait`. */
  models: UnloadedModel[]
  close: () => Promise<void>
}

/**
 * Loads a frame within one budget for faces, images, videos, and models, then
 * settles finite animations. A missing face or image refuses, while an
 * unloaded video or model is returned rather than refused.
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
    // Apart from navigation, so a hanging image's stall can name it.
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
    // The `wait` readers measure layout, which a video's picture never moves.
    const videos =
      fonts === 'require' ? await settleVideos(page, deadline - Date.now()) : []
    const models =
      fonts === 'require' ? await settleModels(page, deadline - Date.now()) : []
    // The `wait` readers finish finite animations themselves on every write.
    if (fonts === 'require' && motion === 'settle') {
      await settleAnimations(page, deadline - Date.now())
    }
    return { page, videos, models, close }
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
 * Renders a frame to PNG for the server's route, inside its device, or one
 * `element` alone on a transparent ground with no device.
 */
export type RenderFrame = (
  frame: {
    ref: string
    box: { width: number; height: number }
    device?: Device
    /** How a foldable is held, which draws its island and fold, closed when absent. */
    pose?: Pose
    element?: number
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
 * One warm browser shared by everything rendering, a failed launch not kept so
 * a browser installed later is found on the next call.
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
      const { element } = frame
      const device = element === undefined ? frame.device : undefined
      // An element's own box is checked once the page reports it.
      if (element === undefined) {
        assertScreenshotFits(
          frame.ref,
          bezelBox({ x: 0, y: 0, ...frame.box }, device),
          scale,
        )
      }
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
        await hideControls(opened.page)
        shot =
          element === undefined
            ? await opened.page.screenshot({
                animations: 'disabled',
                caret: 'hide',
              })
            : await shootElement(opened.page, frame.ref, element, scale)
      } finally {
        await opened.close()
      }
      return device
        ? drawBezel(open, shot, frame.box, { device, pose: frame.pose }, scale)
        : shot
    })
    queue = run.catch(() => {})
    return run
  }
}

/**
 * Hides every drawn control, so an export or a thumbnail shows the design
 * alone. The style is marked as the board's own, so an element export's
 * index still counts the file's elements.
 */
async function hideControls(page: Page): Promise<void> {
  await page.evaluate(
    ({ css, marker }) => {
      const style = document.createElement('style')
      style.setAttribute(marker, '')
      style.textContent = css
      document.head.append(style)
    },
    { css: HIDE_CONTROLS_CSS, marker: LOOK_MARKER },
  )
}

/** One element's shot alone on a transparent ground, at its whole box. */
async function shootElement(
  page: Page,
  ref: string,
  index: number,
  scale: number,
): Promise<Buffer> {
  const box = await isolateElement(page, ref, index)
  assertScreenshotFits(ref, box, scale)
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    // The clip reads against the whole page, so a box past the viewport holds.
    fullPage: true,
    clip: box,
    omitBackground: true,
  })
}

/**
 * A frame's shot drawn inside a device's body, as the board draws it, on a
 * page the size of the body, so the PNG holds the body and nothing past it.
 */
async function drawBezel(
  browser: Browser,
  shot: Buffer,
  box: { width: number; height: number },
  { device, pose = 'closed' }: { device: Device; pose?: Pose },
  scale: number,
): Promise<Buffer> {
  const outer = bezelBox({ x: 0, y: 0, ...box }, device)
  const laptop = device === 'laptop'
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
        : laptop
          ? laptopMarks(box)
          : device === 'foldable'
            ? foldableMarks(pose)
            : ''
    const radius = screenCorners(device)
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<div style="position:absolute;left:${-outer.x}px;top:${-outer.y}px;width:${box.width}px;height:${box.height}px">` +
        `<img alt="" src="data:image/png;base64,${shot.toString('base64')}" style="display:block;width:100%;height:100%;border-radius:${radius}">` +
        `<div style="position:absolute;inset:0;border-radius:${radius};box-shadow:${bezelShadow(device, { board: false })}">${marks}</div>` +
        `</div></body></html>`,
      { waitUntil: 'load' },
    )
    return await page.screenshot({ omitBackground: true, caret: 'hide' })
  } finally {
    await context.close()
  }
}

/**
 * The laptop's chin and base as the board draws them, past the screen's
 * bottom, with the body's edge as its last pixel rather than past it.
 */
function laptopMarks(box: { width: number; height: number }): string {
  const { chin, base } = laptopParts(box)
  const edge = `1px solid ${BEZEL_COLORS.edge}`
  return (
    `<span style="position:absolute;box-sizing:border-box;left:${chin.x}px;top:${chin.y}px;width:${chin.width}px;height:${chin.height}px;background:${BEZEL_COLORS.body};border-left:${edge};border-right:${edge}"></span>` +
    `<span style="position:absolute;box-sizing:border-box;left:${base.x}px;top:${base.y}px;width:${base.width}px;height:${base.height}px;background:${BEZEL_COLORS.base};border:${edge};border-radius:0 0 ${LAPTOP_BASE.radius}px ${LAPTOP_BASE.radius}px"></span>`
  )
}

/** The foldable's fold band, island, and home bar as the board draws them for a pose. */
function foldableMarks(pose: Pose): string {
  const band = foldBand(pose)
  const reach = pose === 'half' ? -BEZELS.foldable.border : 0
  const island = pill(
    FOLDABLE_ISLAND.width,
    FOLDABLE_ISLAND.height,
    BEZEL_COLORS.island,
    islandCenter(pose),
  )
  return (
    (band
      ? `<span style="position:absolute;left:50%;transform:translateX(-50%);top:${reach}px;bottom:${reach}px;width:${band.width}px;background:${band.background}"></span>`
      : '') +
    `<span style="${island}top:${FOLDABLE_ISLAND.top}px"></span>` +
    `<span style="${pill(HOME_BAR.width, HOME_BAR.height, BEZEL_COLORS.homeBar)}bottom:${HOME_BAR.bottom}px"></span>`
  )
}

function pill(
  width: number,
  height: number,
  color: string,
  center = 0.5,
): string {
  return `position:absolute;left:${center * 100}%;transform:translateX(-50%);width:${width}px;height:${height}px;border-radius:${height / 2}px;background:${color};`
}
