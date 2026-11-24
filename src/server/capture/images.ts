import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Browser } from 'playwright-core'

import { COMPOSITE_MARGIN, filmstripWidth } from '@/shared/capture-limits'
import { FrameboardError } from '@/shared/errors'
import { type Device, insetsPage, type Turn } from '@/shared/frame-device'
import { drawnExtent, linkedBoxes } from '@/shared/frame-widths'
import { isReservedPageName, isValidName } from '@/shared/names'
import type { FrameRecord } from '@/shared/records/list'
import { type Theme, THEMES } from '@/shared/theme'

import type { UnloadedModel } from './model-loads'
import {
  assertScreenshotFits,
  LOAD_TIMEOUT_MS,
  MAX_COMPOSITE_SIDE,
  openFrame,
  pageSize,
  readPageColors,
  underPageInsets,
  type WarmBrowser,
} from './render'
import { filmstripMoments, findMotion, type Motion, seekMotion } from './seek'
import type { UnloadedVideo } from './video-loads'

export interface CapturedImage {
  ref: string
  theme: Theme
  path: string
  /** The layout box in CSS pixels, so the file holds `scale` times as many. */
  width: number
  height: number
  scale: number
  /** How far down a scrolled shot reached, past which the page had no more. */
  scrollY?: number
  /** The moment in ms a timed shot holds, clamped to the timeline's end. */
  at?: number
  /** The moment in ms each filmstrip frame holds, left to right. */
  moments?: number[]
  /** Each video the image shows with no picture, absent when every one loaded. */
  videos?: CapturedVideo[]
  /** Each model the image shows undrawn, absent when every one loaded. */
  models?: CapturedModel[]
}

/** A video with no picture, named by the frame it sits in. */
export interface CapturedVideo extends UnloadedVideo {
  ref: string
}

/** A model left undrawn, named by the frame it sits in. */
export interface CapturedModel extends UnloadedModel {
  ref: string
}

/** What a frame's open left without a picture. */
interface Unloaded {
  videos: UnloadedVideo[]
  models: UnloadedModel[]
}

/** The `videos` and `models` keys of an image, each left off when every one loaded. */
function unloadedKeys(
  videos: CapturedVideo[],
  models: CapturedModel[],
): Pick<CapturedImage, 'videos' | 'models'> {
  return {
    ...(videos.length === 0 ? {} : { videos }),
    ...(models.length === 0 ? {} : { models }),
  }
}

function inFrame<T>(ref: string, unloaded: T[]): (T & { ref: string })[] {
  return unloaded.map((each) => ({ ref, ...each }))
}

function keysIn(ref: string, { videos, models }: Unloaded) {
  return unloadedKeys(inFrame(ref, videos), inFrame(ref, models))
}

/** A timed shot's moment, or a filmstrip's frame count, as its file name marks it. */
export type ImageMoment = { at: number } | { filmstrip: number }

interface Rendered extends CapturedImage {
  bytes: Buffer
}

/** The page a composite shows, named as its ref and folder parts. */
export interface CompositePage {
  ref: string
  project: string
  name: string
}

export { COMPOSITE_MARGIN } from '@/shared/capture-limits'

const SCREENSHOT = { animations: 'disabled', caret: 'hide' } as const
// A seeked shot keeps `allow`, since `disabled` fast-forwards a finite
// animation to its end and every moment would show the last frame.
const HELD_SCREENSHOT = { animations: 'allow', caret: 'hide' } as const

/**
 * One image's file name, unscaled at 1x so a path an agent saved stays true,
 * with width, scroll, moment, and filmstrip suffixes.
 */
function imageName(
  name: string,
  theme: Theme,
  scale: number,
  scroll?: number,
  width?: number,
  moment?: ImageMoment,
): string {
  const named = width === undefined ? name : `${name}@${width}`
  const scrolled = scroll === undefined ? named : `${named}.scroll-${scroll}`
  const stem =
    moment === undefined
      ? scrolled
      : 'at' in moment
        ? `${scrolled}.at-${moment.at}`
        : `${scrolled}.filmstrip-${moment.filmstrip}`
  return scale === 1 ? `${stem}.${theme}.png` : `${stem}.${theme}@${scale}x.png`
}

// What `imageName` ends every file on, so a suffix added there is added here.
const IMAGE_END = String.raw`\.(?:${THEMES.join('|')})(?:@[23]x)?\.png$`
const FRAME_IMAGE = new RegExp(
  String.raw`^([^@]+?)(?:@\d+)?(?:\.(?:scroll|at|filmstrip)-\d+)?${IMAGE_END}`,
)
const COMPOSITE_IMAGE = new RegExp(`^([^@]+)${IMAGE_END}`)

/** Whether a file in a page's folder is named as a capture of some frame names it. */
export function isFrameImageName(file: string): boolean {
  return isValidName(FRAME_IMAGE.exec(file)?.[1] ?? '')
}

/** Whether a file in a project's folder is named as a composite of some page names it. */
export function isCompositeImageName(file: string): boolean {
  const page = COMPOSITE_IMAGE.exec(file)?.[1] ?? ''
  return isValidName(page) && !isReservedPageName(page)
}

/** Where one frame's capture in one theme lands under `out`. */
export function frameImagePath(
  out: string,
  frame: Pick<FrameRecord, 'project' | 'page' | 'name'>,
  theme: Theme,
  scale = 1,
  scroll?: number,
  width?: number,
  moment?: ImageMoment,
): string {
  return join(
    out,
    frame.project,
    frame.page,
    imageName(frame.name, theme, scale, scroll, width, moment),
  )
}

/** Where a page's composite in one theme lands under `out`. */
export function compositeImagePath(
  out: string,
  page: CompositePage,
  theme: Theme,
  scale = 1,
): string {
  return join(out, page.project, imageName(page.name, theme, scale))
}

/**
 * The composite's size and each frame's shift, one margin on every side, and
 * `capture-too-large` past Chromium's screenshot limit.
 */
export function compositeBounds(
  page: CompositePage,
  frames: (Pick<FrameRecord, 'box'> &
    Partial<Pick<FrameRecord, 'widths' | 'device'>>)[],
  scale = 1,
): { width: number; height: number; dx: number; dy: number } {
  const extents = frames.map(({ box, widths, device }) =>
    drawnExtent(box, widths ?? [], device),
  )
  const left = Math.min(...extents.map((box) => box.x))
  const top = Math.min(...extents.map((box) => box.y))
  const right = Math.max(...extents.map((box) => box.x + box.width))
  const bottom = Math.max(...extents.map((box) => box.y + box.height))
  const width = right - left + 2 * COMPOSITE_MARGIN
  const height = bottom - top + 2 * COMPOSITE_MARGIN
  if (
    width * scale > MAX_COMPOSITE_SIDE ||
    height * scale > MAX_COMPOSITE_SIDE
  ) {
    const at = scale === 1 ? '' : ` at ${scale}x`
    throw new FrameboardError(
      'capture-too-large',
      `A composite of ${page.ref}${at} would be ${width * scale} by ${height * scale} px, past the ${MAX_COMPOSITE_SIDE} px a browser screenshot holds. Capture its frames one by one instead.`,
      { ref: page.ref, width, height, scale, max: MAX_COMPOSITE_SIDE },
    )
  }
  return {
    width,
    height,
    dx: COMPOSITE_MARGIN - left,
    dy: COMPOSITE_MARGIN - top,
  }
}

/**
 * A filmstrip's size: `count` copies of the frame's box in one row, one
 * margin around and between them. Refuses `capture-too-large` past
 * Chromium's screenshot limit.
 */
export function filmstripBounds(
  ref: string,
  box: { width: number; height: number },
  count: number,
  scale = 1,
): { width: number; height: number } {
  const width = filmstripWidth(box.width, count)
  const height = box.height + 2 * COMPOSITE_MARGIN
  if (
    width * scale > MAX_COMPOSITE_SIDE ||
    height * scale > MAX_COMPOSITE_SIDE
  ) {
    const at = scale === 1 ? '' : ` at ${scale}x`
    throw new FrameboardError(
      'capture-too-large',
      `A filmstrip of ${count} frames of ${ref}${at} would be ${width * scale} by ${height * scale} px, past the ${MAX_COMPOSITE_SIDE} px a browser screenshot holds. Ask for fewer frames or a smaller scale.`,
      { ref, width, height, scale, max: MAX_COMPOSITE_SIDE },
    )
  }
  return { width, height }
}

/**
 * Captures each frame per theme and linked width, rendering every image before
 * writing any, so a refusal leaves no half-written set an agent reads as current.
 */
export async function captureFrameImages(
  browser: Browser,
  {
    baseUrl,
    frames,
    themes,
    out,
    scale = 1,
    scroll,
    width,
  }: {
    baseUrl: string
    frames: FrameRecord[]
    themes: readonly Theme[]
    out: string
    scale?: number
    scroll?: number
    width?: number
  },
): Promise<CapturedImage[]> {
  const rendered: Rendered[] = []
  for (const frame of frames) {
    for (const view of viewsOf(frame, width)) {
      for (const theme of themes) {
        const shot = await renderFrame(
          browser,
          baseUrl,
          frame,
          view,
          theme,
          scale,
          scroll,
        )
        const linked = view.width === frame.box.width ? undefined : view.width
        rendered.push({
          ref: frame.ref,
          theme,
          path: frameImagePath(out, frame, theme, scale, scroll, linked),
          width: view.width,
          height: view.height,
          scale,
          ...(shot.scrollY === undefined ? {} : { scrollY: shot.scrollY }),
          ...keysIn(frame.ref, shot),
          bytes: shot.bytes,
        })
      }
    }
  }
  return writeImages(rendered)
}

/** The boxes a frame shows at, its own first, or the one `width` names. */
function viewsOf(
  frame: FrameRecord,
  width: number | undefined,
): { width: number; height: number }[] {
  const own = { width: frame.box.width, height: frame.box.height }
  const views = [own, ...frame.widths]
  return width === undefined
    ? views
    : views.filter((view) => view.width === width)
}

/**
 * Captures one image per page and theme, every frame at its layout box on the
 * theme's canvas color. Each frame renders as it does alone, font check
 * included, and no composite is written until every page rendered.
 */
export async function captureComposites(
  browser: Browser,
  {
    baseUrl,
    pages,
    themes,
    out,
    scale = 1,
  }: {
    baseUrl: string
    pages: (CompositePage & { frames: FrameRecord[] })[]
    themes: readonly Theme[]
    out: string
    scale?: number
  },
): Promise<CapturedImage[]> {
  // Bounded ahead of the first render, so an oversized last page costs no wait.
  const bounded = pages.map((page) => ({
    page,
    bounds: compositeBounds(page, page.frames, scale),
  }))
  const rendered: Rendered[] = []
  for (const { page, bounds } of bounded) {
    for (const theme of themes) {
      const tiles: string[] = []
      // A frame's linked widths each open it again, so its videos and models count once.
      const videos = new Map<string, CapturedVideo>()
      const models = new Map<string, CapturedModel>()
      for (const frame of page.frames) {
        for (const box of [
          frame.box,
          ...linkedBoxes(frame.box, frame.widths, frame.device),
        ]) {
          const shot = await renderFrame(
            browser,
            baseUrl,
            frame,
            box,
            theme,
            scale,
          )
          for (const video of inFrame(frame.ref, shot.videos)) {
            videos.set(`${video.ref} ${video.index}`, video)
          }
          for (const model of inFrame(frame.ref, shot.models)) {
            models.set(`${model.ref} ${model.index}`, model)
          }
          tiles.push(
            `<img src="data:image/png;base64,${shot.bytes.toString('base64')}" style="position:absolute;left:${box.x + bounds.dx}px;top:${box.y + bounds.dy}px;width:${box.width}px;height:${box.height}px">`,
          )
        }
      }
      rendered.push({
        ref: page.ref,
        theme,
        path: compositeImagePath(out, page, theme, scale),
        width: bounds.width,
        height: bounds.height,
        scale,
        ...unloadedKeys([...videos.values()], [...models.values()]),
        bytes: await renderComposite(browser, bounds, theme, tiles, scale),
      })
    }
  }
  return writeImages(rendered)
}

/**
 * Captures a frame held at moments of its timeline, per theme and width,
 * rendering every image before writing any.
 */
export async function captureMotionImages(
  browser: Browser,
  {
    baseUrl,
    frame,
    themes,
    out,
    scale = 1,
    width,
    timing,
    motionTimeoutMs = LOAD_TIMEOUT_MS,
  }: {
    baseUrl: string
    frame: FrameRecord
    themes: readonly Theme[]
    out: string
    scale?: number
    width?: number
    /** The moments in ms to hold, or how many a filmstrip spaces. */
    timing: { at: number[] } | { filmstrip: number }
    motionTimeoutMs?: number
  },
): Promise<{ images: CapturedImage[]; motion: Motion | null }> {
  const rendered: Rendered[] = []
  let found: Motion | null = null
  for (const view of viewsOf(frame, width)) {
    const linked = view.width === frame.box.width ? undefined : view.width
    for (const theme of themes) {
      if ('filmstrip' in timing) {
        const strip = await renderFilmstrip(browser, {
          baseUrl,
          frame: {
            ref: frame.ref,
            box: view,
            device: viewDevice(frame, view),
            turn: frame.turn,
          },
          theme,
          scale,
          count: timing.filmstrip,
          motionTimeoutMs,
        })
        found ??= strip.motion
        rendered.push({
          ref: frame.ref,
          theme,
          path: frameImagePath(out, frame, theme, scale, undefined, linked, {
            filmstrip: strip.moments.length,
          }),
          width: strip.width,
          height: strip.height,
          scale,
          moments: strip.moments,
          ...keysIn(frame.ref, strip),
          bytes: strip.bytes,
        })
        continue
      }
      const shots = await holdShots(browser, {
        baseUrl,
        ref: frame.ref,
        view,
        device: viewDevice(frame, view),
        turn: frame.turn,
        theme,
        scale,
        motionTimeoutMs,
        moments: () => timing.at,
      })
      found ??= shots.motion
      shots.held.forEach(({ held, bytes }, index) => {
        rendered.push({
          ref: frame.ref,
          theme,
          path: frameImagePath(out, frame, theme, scale, undefined, linked, {
            at: timing.at[index] ?? held,
          }),
          width: view.width,
          height: view.height,
          scale,
          at: held,
          ...keysIn(frame.ref, shots),
          bytes,
        })
      })
    }
  }
  return { images: await writeImages(rendered), motion: found }
}

export interface RenderedFilmstrip {
  bytes: Buffer
  /** The strip's size in CSS pixels, margins included. */
  width: number
  height: number
  /** The moment in ms each frame of the strip holds, left to right. */
  moments: number[]
  motion: Motion
  /** The videos the strip shows with no picture. */
  videos: UnloadedVideo[]
  /** The models the strip shows undrawn. */
  models: UnloadedModel[]
}

/**
 * One frame's filmstrip in one theme, refusing `capture-too-large` before
 * opening the frame for a strip past the screenshot limit.
 */
export async function renderFilmstrip(
  browser: Browser,
  {
    baseUrl,
    frame,
    theme,
    scale = 1,
    count,
    motionTimeoutMs = LOAD_TIMEOUT_MS,
  }: {
    baseUrl: string
    frame: {
      ref: string
      box: { width: number; height: number }
      /** The device the strip's page draws under, none when absent. */
      device?: Device | null
      turn?: Turn
    }
    theme: Theme
    scale?: number
    count: number
    motionTimeoutMs?: number
  },
): Promise<RenderedFilmstrip> {
  const view = { width: frame.box.width, height: frame.box.height }
  const strip = filmstripBounds(frame.ref, view, count, scale)
  const { motion, held, videos, models } = await holdShots(browser, {
    baseUrl,
    ref: frame.ref,
    view,
    device: frame.device,
    turn: frame.turn,
    theme,
    scale,
    motionTimeoutMs,
    moments: (found) => filmstripMoments(frame.ref, found, count),
  })
  const tiles = held.map(
    ({ bytes }, index) =>
      `<img src="data:image/png;base64,${bytes.toString('base64')}" style="position:absolute;left:${COMPOSITE_MARGIN + index * (view.width + COMPOSITE_MARGIN)}px;top:${COMPOSITE_MARGIN}px;width:${view.width}px;height:${view.height}px">`,
  )
  return {
    bytes: await renderComposite(browser, strip, theme, tiles, scale),
    width: strip.width,
    height: strip.height,
    moments: held.map((shot) => shot.held),
    motion,
    videos,
    models,
  }
}

/**
 * Opens one frame with its animation clock held, finds its timeline, and
 * shoots it at each moment `moments` picks from what it found.
 */
async function holdShots(
  browser: Browser,
  {
    baseUrl,
    ref,
    view,
    device,
    turn,
    theme,
    scale,
    motionTimeoutMs,
    moments,
  }: {
    baseUrl: string
    ref: string
    view: { width: number; height: number }
    /** The device the view draws its page under, a phone's status bar shown over each shot. */
    device?: Device | null
    turn?: Turn
    theme: Theme
    scale: number
    motionTimeoutMs: number
    moments: (motion: Motion) => number[]
  },
): Promise<{
  motion: Motion
  held: { held: number; bytes: Buffer }[]
  videos: UnloadedVideo[]
  models: UnloadedModel[]
}> {
  assertScreenshotFits(ref, view, scale)
  const opened = await openFrame(browser, {
    baseUrl,
    ref,
    box: pageSize(view, device, turn),
    theme,
    scale,
    motion: 'hold',
  })
  try {
    // Each theme's context seeks on its own, so no shot waits on another.
    const motion = await findMotion(opened.page, ref, motionTimeoutMs)
    const colors = insetsPage(device, turn)
      ? await readPageColors(opened.page)
      : null
    const held: { held: number; bytes: Buffer }[] = []
    for (const moment of moments(motion)) {
      const at = await seekMotion(opened.page, motion, moment)
      const shot = await opened.page.screenshot(HELD_SCREENSHOT)
      held.push({
        held: at,
        bytes: colors
          ? await underPageInsets(
              browser,
              shot,
              view,
              { device, turn, colors, theme },
              scale,
            )
          : shot,
      })
    }
    return { motion, held, videos: opened.videos, models: opened.models }
  } finally {
    await opened.close()
  }
}

/**
 * The device a view draws its page under: the frame's own while the view
 * is the frame's own box, and none at a linked width, which draws no device.
 */
function viewDevice(
  frame: FrameRecord,
  view: { width: number },
): Device | undefined {
  return view.width === frame.box.width ? frame.device : undefined
}

// One frame at a time, so a slow frame never holds several tabs open.
async function renderFrame(
  browser: Browser,
  baseUrl: string,
  frame: FrameRecord,
  view: { width: number; height: number },
  theme: Theme,
  scale: number,
  scroll?: number,
): Promise<{ bytes: Buffer; scrollY?: number } & Unloaded> {
  const box = { width: view.width, height: view.height }
  assertScreenshotFits(frame.ref, box, scale)
  const device = viewDevice(frame, view)
  const opened = await openFrame(browser, {
    baseUrl,
    ref: frame.ref,
    box: pageSize(box, device, frame.turn),
    theme,
    scale,
  })
  try {
    const scrollY =
      scroll === undefined
        ? undefined
        : await opened.page.evaluate(scrollAndSettle, scroll)
    const shot = await opened.page.screenshot(SCREENSHOT)
    const bytes = insetsPage(device, frame.turn)
      ? await underPageInsets(
          browser,
          shot,
          box,
          {
            device,
            turn: frame.turn,
            colors: await readPageColors(opened.page),
            theme,
          },
          scale,
        )
      : shot
    return {
      bytes,
      scrollY,
      videos: opened.videos,
      models: opened.models,
    }
  } finally {
    await opened.close()
  }
}

// Runs in the page. The browser clamps the offset to the page's end, and two
// frames let a scroll listener and sticky layout settle before the shot.
function scrollAndSettle(top: number): Promise<number> {
  window.scrollTo({ top, behavior: 'instant' })
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve(Math.round(window.scrollY))),
    )
  })
}

async function renderComposite(
  browser: Browser,
  { width, height }: { width: number; height: number },
  theme: Theme,
  tiles: string[],
  scale: number,
): Promise<Buffer> {
  // Tiles sit at CSS pixels, and the device scale gives each its own pixels back.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: theme,
  })
  try {
    const page = await context.newPage()
    // Frames stack in the order given, which is the page's stacking order.
    await page.setContent(
      `<!doctype html><html style="color-scheme:${theme}"><body style="margin:0;position:relative;width:${width}px;height:${height}px;background:Canvas">${tiles.join('')}</body></html>`,
    )
    await page.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode())),
    )
    return await page.screenshot(SCREENSHOT)
  } finally {
    await context.close()
  }
}

async function writeImages(rendered: Rendered[]): Promise<CapturedImage[]> {
  await Promise.all(
    rendered.map(async ({ path, bytes }) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    }),
  )
  return rendered.map(({ bytes: _bytes, ...image }) => image)
}

/**
 * Renders a frame's filmstrip to PNG bytes in a theme, as the server's PNG
 * route asks, `count` moments wide at `scale` device pixels per CSS pixel.
 */
export type RenderFilmstrip = (
  frame: { ref: string; box: { width: number; height: number } },
  theme: Theme,
  scale: number,
  count: number,
) => Promise<Buffer>

/**
 * Renders filmstrips on a server's warm browser one at a time. The queue is
 * its own, so Copy as PNG and a plain export never wait behind a strip of
 * many moments.
 */
export function createWarmFilmstripRenderer({
  baseUrl,
  browser,
}: {
  /** Read per render, since the server's port is known only once listening. */
  baseUrl: () => string
  browser: WarmBrowser
}): RenderFilmstrip {
  let queue: Promise<unknown> = Promise.resolve()

  return (frame, theme, scale, count) => {
    const run = queue.then(async () => {
      const strip = await renderFilmstrip(await browser.get(), {
        baseUrl: baseUrl(),
        frame,
        theme,
        scale,
        count,
      })
      return strip.bytes
    })
    queue = run.catch(() => {})
    return run
  }
}
