import type { Browser, Page } from 'playwright-core'

import { HIDE_CONTROLS_CSS } from '@/shared/bindings'
import { MAX_COMPOSITE_SIDE } from '@/shared/capture-limits'
import { FrameboardError } from '@/shared/errors'
import {
  BATTERY,
  BEZEL_COLORS,
  bezelBox,
  BEZELS,
  bezelShadow,
  BUTTON_DEPTH,
  type Device,
  FOLDABLE_ISLAND,
  foldBand,
  HOME_BAR,
  insetsPage,
  type Island,
  islandCenter,
  isTurned,
  LAPTOP_BASE,
  laptopParts,
  pageBox,
  type PageColors,
  pageColors,
  pageCorners,
  PHONE_BUTTONS,
  phoneIsland,
  type Pose,
  screenCorners,
  sideInset,
  SIGNAL_BARS,
  STATUS_BAR,
  STATUS_FONT,
  type Turn,
  turnOf,
  WIDE_ISLAND_LEVEL,
  WIDE_ISLAND_TIMER,
} from '@/shared/frame-device'
import { frameThemeUrl, LOOK_MARKER, type Theme } from '@/shared/theme'

import { settleAnimations } from './animation-settle'
import { isolateElement } from './element-shot'
import { assertFontsPresent } from './fonts'
import { settleImages } from './image-loads'
import { settleModels, type UnloadedModel, watchModels } from './model-loads'
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
    if (fonts === 'require') await watchModels(page)
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
    /** The phone's island width, compact when absent. */
    island?: Island
    /** How a phone, tablet, or foldable is turned, upright when absent. */
    turn?: Turn
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
          bezelBox({ x: 0, y: 0, ...frame.box }, device, frame.turn),
          scale,
        )
      }
      const open = await browser.get()
      const opened = await openFrame(open, {
        baseUrl: baseUrl(),
        ref: frame.ref,
        box: pageSize(frame.box, device, frame.turn),
        theme,
        scale,
      })
      let shot: Buffer
      let colors: PageColors | null = null
      try {
        await hideControls(opened.page)
        if (insetsPage(device, frame.turn))
          colors = await readPageColors(opened.page)
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
        ? drawBezel(
            open,
            shot,
            frame.box,
            {
              device,
              pose: frame.pose,
              island: frame.island,
              turn: frame.turn,
              bar: { colors, theme },
            },
            scale,
          )
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
  {
    device,
    pose = 'closed',
    island = 'compact',
    turn,
    bar,
  }: {
    device: Device
    pose?: Pose
    island?: Island
    turn?: Turn
    /** The page's colors and theme, which a phone's status bar or a turned phone's or foldable's side strips paint. */
    bar: { colors: PageColors | null; theme: Theme }
  },
  scale: number,
): Promise<Buffer> {
  const outer = bezelBox({ x: 0, y: 0, ...box }, device, turn)
  const page = pageBox({ x: 0, y: 0, ...box }, device, turn)
  const laptop = device === 'laptop'
  const context = await browser.newContext({
    viewport: { width: outer.width, height: outer.height },
    deviceScaleFactor: scale,
  })
  try {
    const tab = await context.newPage()
    const sideways = turnOf(turn)
    const marks =
      device === 'phone'
        ? sideways === 'upright'
          ? statusBarHtml(bar.colors, bar.theme) + phoneMarks(island)
          : sideStripsHtml(bar.colors, bar.theme) +
            turnedPhoneMarks(island, sideways)
        : laptop
          ? laptopMarks(box)
          : device === 'foldable'
            ? (sideways === 'upright'
                ? ''
                : sideStripsHtml(bar.colors, bar.theme, { device })) +
              foldableMarks(pose, sideways)
            : ''
    const radius = screenCorners(device)
    await tab.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<div style="position:absolute;left:${-outer.x}px;top:${-outer.y}px;width:${box.width}px;height:${box.height}px">` +
        `<img alt="" src="data:image/png;base64,${shot.toString('base64')}" style="position:absolute;left:${page.x}px;top:${page.y}px;width:${page.width}px;height:${page.height}px;border-radius:${pageCorners(device, turn)}">` +
        `<div style="position:absolute;inset:0;border-radius:${radius};box-shadow:${bezelShadow(device, { board: false })}">${marks}</div>` +
        `</div></body></html>`,
      { waitUntil: 'load' },
    )
    return await tab.screenshot({ omitBackground: true, caret: 'hide' })
  } finally {
    await context.close()
  }
}

/**
 * A phone frame's shot of its page set under the status bar upright, or a
 * phone's or foldable's between the side strips turned, at the frame's box
 * with no body, so a capture holds the screen the board draws.
 */
export async function underPageInsets(
  browser: Browser,
  shot: Buffer,
  box: { width: number; height: number },
  {
    device,
    turn,
    colors,
    theme,
  }: {
    device: Device | null | undefined
    turn: Turn | undefined
    colors: PageColors | null
    theme: Theme
  },
  scale: number,
): Promise<Buffer> {
  const page = pageBox({ x: 0, y: 0, ...box }, device, turn)
  const chrome =
    device && isTurned(device, turn)
      ? sideStripsHtml(colors, theme, { device, rounded: false })
      : statusBarHtml(colors, theme, { rounded: false })
  const context = await browser.newContext({
    viewport: box,
    deviceScaleFactor: scale,
  })
  try {
    const tab = await context.newPage()
    await tab.setContent(
      `<!doctype html><html><body style="margin:0;position:relative;width:${box.width}px;height:${box.height}px">` +
        `<img alt="" src="data:image/png;base64,${shot.toString('base64')}" style="position:absolute;left:${page.x}px;top:${page.y}px;width:${page.width}px;height:${page.height}px">` +
        chrome +
        `</body></html>`,
      { waitUntil: 'load' },
    )
    return await tab.screenshot({ caret: 'hide' })
  } finally {
    await context.close()
  }
}

/** A loaded page's fill and text color, which the browser reads off its own document. */
export function readPageColors(page: Page): Promise<PageColors> {
  // Called with no argument, so the function reads the page's own document.
  return page.evaluate(pageColors as () => PageColors)
}

/** The viewport a frame's page opens at, its box less a phone's insets, at least one pixel tall. */
export function pageSize(
  box: { width: number; height: number },
  device: Device | null | undefined,
  turn: Turn | undefined,
): { width: number; height: number } {
  const page = pageBox({ x: 0, y: 0, ...box }, device, turn)
  return { width: page.width, height: Math.max(1, page.height) }
}

/**
 * The phone's status bar as the board draws it, in the page's fill and text
 * color or its theme's own, its top corners rounded to the screen inside a
 * body and square on a frame's bare box.
 */
export function statusBarHtml(
  colors: PageColors | null,
  theme: Theme,
  { rounded = true }: { rounded?: boolean } = {},
): string {
  const { screenRadius } = BEZELS.phone
  const corners = rounded ? `${screenRadius}px ${screenRadius}px 0 0` : '0'
  const signal = SIGNAL_BARS.map(
    (tall) =>
      `<span style="width:3px;height:${tall}px;border-radius:1px;background:currentColor"></span>`,
  ).join('')
  const battery =
    `<span style="display:flex;align-items:center">` +
    `<span style="box-sizing:border-box;display:flex;align-items:center;width:${BATTERY.width}px;height:${BATTERY.height}px;border:1px solid currentColor;border-radius:${BATTERY.radius}px;padding:1.5px;opacity:.9"><span style="width:80%;height:100%;border-radius:2px;background:currentColor"></span></span>` +
    `<span style="width:${BATTERY.cap}px;height:4px;margin-left:1px;border-radius:0 1px 1px 0;background:currentColor;opacity:.6"></span>` +
    `</span>`
  return (
    `<div style="position:absolute;left:0;right:0;top:0;height:${STATUS_BAR.height}px;border-radius:${corners};color-scheme:${theme};background:${colors?.fill ?? 'Canvas'};color:${colors?.ink ?? 'CanvasText'}">` +
    `<div style="position:absolute;left:0;right:0;top:${STATUS_BAR.band.top}px;height:${STATUS_BAR.band.height}px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 ${STATUS_BAR.side}px;font:600 ${STATUS_BAR.font}px/1 ${STATUS_FONT};font-variant-numeric:tabular-nums">` +
    `<span>${STATUS_BAR.time}</span>` +
    `<span style="display:flex;align-items:center;gap:6px"><span style="display:flex;align-items:flex-end;gap:2px">${signal}</span>${battery}</span>` +
    `</div></div>`
  )
}

/**
 * A turned phone's or foldable's two side strips as the board draws them, the
 * side inset wide in the page's fill or its theme's own, rounded on the
 * screen's outer corners inside a body and square on a frame's bare box.
 */
export function sideStripsHtml(
  colors: PageColors | null,
  theme: Theme,
  {
    device = 'phone',
    rounded = true,
  }: { device?: Device; rounded?: boolean } = {},
): string {
  const radius = rounded ? BEZELS[device].screenRadius : 0
  const width = sideInset(device, 'left')
  const strip = (side: 'left' | 'right', corners: string) =>
    `<div style="position:absolute;${side}:0;top:0;bottom:0;width:${width}px;border-radius:${corners};color-scheme:${theme};background:${colors?.fill ?? 'Canvas'}"></div>`
  return (
    strip('left', `${radius}px 0 0 ${radius}px`) +
    strip('right', `0 ${radius}px ${radius}px 0`)
  )
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

/** The phone's buttons, island, and home bar as the board draws them. */
function phoneMarks(island: Island): string {
  const { border } = BEZELS.phone
  const buttons = PHONE_BUTTONS.map(
    ({ side, top, height }) =>
      `<span style="position:absolute;${side}:${-border - BUTTON_DEPTH}px;top:${top - border}px;width:${BUTTON_DEPTH}px;height:${height}px;border-radius:${BUTTON_DEPTH / 2}px;background:${BEZEL_COLORS.button}"></span>`,
  ).join('')
  const shape = phoneIsland(island)
  return (
    buttons +
    `<span style="${pill(shape.width, shape.height, BEZEL_COLORS.island)}top:${shape.top}px;${ISLAND_TEXT}">${islandTimer(island)}</span>` +
    `<span style="${pill(HOME_BAR.width, HOME_BAR.height, BEZEL_COLORS.homeBar)}bottom:${HOME_BAR.bottom}px"></span>`
  )
}

const ISLAND_TEXT = `box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 11px;color:${BEZEL_COLORS.islandText};font:600 11px/1 ${STATUS_FONT};font-variant-numeric:tabular-nums`

function islandTimer(island: Island): string {
  if (island !== 'wide') return ''
  return (
    `<span style="display:flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:3px;background:${BEZEL_COLORS.islandLive}"></span>${WIDE_ISLAND_TIMER}</span>` +
    `<span style="display:flex;align-items:flex-end;gap:2px">${WIDE_ISLAND_LEVEL.map((tall) => `<span style="width:2px;height:${tall}px;border-radius:1px;background:${BEZEL_COLORS.islandLive}"></span>`).join('')}</span>`
  )
}

/** A turned phone's island on end and its buttons on the long edges, as the board's bezel draws them. */
function turnedPhoneMarks(island: Island, turn: 'left' | 'right'): string {
  const { border } = BEZELS.phone
  const from = turn === 'left' ? 'left' : 'right'
  const buttons = PHONE_BUTTONS.map(({ side, top, height }) => {
    const edge = (side === 'left') === (turn === 'left') ? 'bottom' : 'top'
    return `<span style="position:absolute;${edge}:${-border - BUTTON_DEPTH}px;${from}:${top - border}px;width:${height}px;height:${BUTTON_DEPTH}px;border-radius:${BUTTON_DEPTH / 2}px;background:${BEZEL_COLORS.button}"></span>`
  }).join('')
  const shape = phoneIsland(island)
  const center = shape.top + shape.height / 2
  const left = turn === 'left' ? `${center}px` : `calc(100% - ${center}px)`
  return (
    buttons +
    `<span style="position:absolute;left:${left};top:50%;transform:translate(-50%,-50%) rotate(${turn === 'left' ? -90 : 90}deg);width:${shape.width}px;height:${shape.height}px;border-radius:${shape.height / 2}px;background:${BEZEL_COLORS.island};${ISLAND_TEXT}">${islandTimer(island)}</span>` +
    `<span style="${pill(HOME_BAR.width, HOME_BAR.height, BEZEL_COLORS.homeBar)}bottom:${HOME_BAR.bottom}px"></span>`
  )
}

/** The foldable's fold band, island, and home bar as the board draws them for a pose and a turn. */
function foldableMarks(pose: Pose, turn: Turn): string {
  const band = foldBand(pose, turn)
  const reach = pose === 'half' ? -BEZELS.foldable.border : 0
  const place = islandCenter(pose, turn)
  const { width, height, top } = FOLDABLE_ISLAND
  const island =
    place.edge === 'top'
      ? `${pill(width, height, BEZEL_COLORS.island, place.along)}top:${top}px`
      : `position:absolute;${place.edge}:${top}px;top:${place.along * 100}%;transform:translateY(-50%);width:${height}px;height:${width}px;border-radius:${height / 2}px;background:${BEZEL_COLORS.island}`
  const fold = !band
    ? ''
    : band.runs === 'down'
      ? `<span style="position:absolute;left:50%;transform:translateX(-50%);top:${reach}px;bottom:${reach}px;width:${band.width}px;background:${band.background}"></span>`
      : `<span style="position:absolute;top:50%;transform:translateY(-50%);left:${reach}px;right:${reach}px;height:${band.width}px;background:${band.background}"></span>`
  return (
    fold +
    `<span style="${island}"></span>` +
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
