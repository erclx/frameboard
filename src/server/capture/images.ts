import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Browser } from 'playwright-core'

import { COMPOSITE_MARGIN, filmstripWidth } from '@/shared/capture-limits'
import { FrameboardError } from '@/shared/errors'
import { drawnExtent, linkedBoxes } from '@/shared/frame-widths'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import {
  assertScreenshotFits,
  LOAD_TIMEOUT_MS,
  MAX_COMPOSITE_SIDE,
  openFrame,
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
}

/** A video with no picture, named by the frame it sits in. */
export interface CapturedVideo extends UnloadedVideo {
  ref: string
}

/** The `videos` key of an image, left off when every video loaded. */
function videosKey(videos: CapturedVideo[]): { videos?: CapturedVideo[] } {
  return videos.length === 0 ? {} : { videos }
}

function inFrame(ref: string, videos: UnloadedVideo[]): CapturedVideo[] {
  return videos.map((video) => ({ ref, ...video }))
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
 * The file name of one image, `<name>.<theme>.png` at 1x so a path an agent
 * saved stays true, and `<name>.<theme>@<n>x.png` at any other scale. A shot
 * scrolled down takes `.scroll-<px>` after the name, the offset asked for,
 * and a linked width takes `@<width>` ahead of both. A timed shot takes
 * `.at-<ms>`, the moment asked for, and a filmstrip `.filmstrip-<n>`, each
 * after the width.
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
 * The composite's size and the shift placing each frame in it, so the
 * leftmost and topmost frames sit one margin in and one margin is left past
 * the far edges, each frame's linked widths included. Refuses
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
 * Captures each frame in each theme at its layout size times `scale`, one PNG
 * apiece, and again at each linked width it lists, at the height that width
 * holds. Every image renders before any is written, so a refusal on one frame
 * leaves no half-written set an agent could read as current. A `scroll`
 * offset shoots each view that far down, clamped to the page's end. `width`
 * shoots each frame at that one width alone, its own or a linked one.
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
          ...videosKey(inFrame(frame.ref, shot.videos)),
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
 * Captures one image of a page per theme, every frame at its layout box on
 * the theme's canvas color. Each frame renders as it does alone, font check
 * included, and the composite is written only once every theme rendered.
 */
export async function captureComposite(
  browser: Browser,
  {
    baseUrl,
    page,
    frames,
    themes,
    out,
    scale = 1,
  }: {
    baseUrl: string
    page: CompositePage
    frames: FrameRecord[]
    themes: readonly Theme[]
    out: string
    scale?: number
  },
): Promise<CapturedImage[]> {
  const bounds = compositeBounds(page, frames, scale)
  const rendered: Rendered[] = []
  for (const theme of themes) {
    const tiles: string[] = []
    // A frame's linked widths each open it again, so its videos count once.
    const videos = new Map<string, CapturedVideo>()
    for (const frame of frames) {
      for (const box of [frame.box, ...linkedBoxes(frame.box, frame.widths)]) {
        const { bytes, videos: unloaded } = await renderFrame(
          browser,
          baseUrl,
          frame,
          box,
          theme,
          scale,
        )
        for (const video of inFrame(frame.ref, unloaded)) {
          videos.set(`${video.ref} ${video.index}`, video)
        }
        tiles.push(
          `<img src="data:image/png;base64,${bytes.toString('base64')}" style="position:absolute;left:${box.x + bounds.dx}px;top:${box.y + bounds.dy}px;width:${box.width}px;height:${box.height}px">`,
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
      ...videosKey([...videos.values()]),
      bytes: await renderComposite(browser, bounds, theme, tiles, scale),
    })
  }
  return writeImages(rendered)
}

/**
 * Captures one frame held at set moments of its timeline, in each theme and
 * at each width it shows at, or the one `width` names. `timing.at` writes one
 * PNG per moment, and `timing.filmstrip` one PNG per view and theme holding that many
 * moments spaced from 0 to the timeline's end. A frame with no seekable
 * timeline refuses `motion-missing`, and a filmstrip of one that never ends
 * `motion-unbounded`. Every image renders before any is written.
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
          frame: { ref: frame.ref, box: view },
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
          ...videosKey(inFrame(frame.ref, strip.videos)),
          bytes: strip.bytes,
        })
        continue
      }
      const shots = await holdShots(browser, {
        baseUrl,
        ref: frame.ref,
        view,
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
          ...videosKey(inFrame(frame.ref, shots.videos)),
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
}

/**
 * One frame's filmstrip in one theme: `count` moments spaced from 0 to the
 * timeline's end, held one by one and laid in a row on the theme's canvas
 * color. Refuses `motion-missing` for a frame with no seekable timeline and
 * `motion-unbounded` for one that never ends, and `capture-too-large` before
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
    frame: { ref: string; box: { width: number; height: number } }
    theme: Theme
    scale?: number
    count: number
    motionTimeoutMs?: number
  },
): Promise<RenderedFilmstrip> {
  const view = { width: frame.box.width, height: frame.box.height }
  const strip = filmstripBounds(frame.ref, view, count, scale)
  const { motion, held, videos } = await holdShots(browser, {
    baseUrl,
    ref: frame.ref,
    view,
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
    theme,
    scale,
    motionTimeoutMs,
    moments,
  }: {
    baseUrl: string
    ref: string
    view: { width: number; height: number }
    theme: Theme
    scale: number
    motionTimeoutMs: number
    moments: (motion: Motion) => number[]
  },
): Promise<{
  motion: Motion
  held: { held: number; bytes: Buffer }[]
  videos: UnloadedVideo[]
}> {
  assertScreenshotFits(ref, view, scale)
  const opened = await openFrame(browser, {
    baseUrl,
    ref,
    box: view,
    theme,
    scale,
    motion: 'hold',
  })
  try {
    // Each theme's context seeks on its own, so no shot waits on another.
    const motion = await findMotion(opened.page, ref, motionTimeoutMs)
    const held: { held: number; bytes: Buffer }[] = []
    for (const moment of moments(motion)) {
      const at = await seekMotion(opened.page, motion, moment)
      held.push({
        held: at,
        bytes: await opened.page.screenshot(HELD_SCREENSHOT),
      })
    }
    return { motion, held, videos: opened.videos }
  } finally {
    await opened.close()
  }
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
): Promise<{ bytes: Buffer; scrollY?: number; videos: UnloadedVideo[] }> {
  const box = { width: view.width, height: view.height }
  assertScreenshotFits(frame.ref, box, scale)
  const opened = await openFrame(browser, {
    baseUrl,
    ref: frame.ref,
    box,
    theme,
    scale,
  })
  try {
    const scrollY =
      scroll === undefined
        ? undefined
        : await opened.page.evaluate(scrollAndSettle, scroll)
    return {
      bytes: await opened.page.screenshot(SCREENSHOT),
      scrollY,
      videos: opened.videos,
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
