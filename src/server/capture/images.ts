import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Browser } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import { assertScreenshotFits, MAX_COMPOSITE_SIDE, openFrame } from './render'

export interface CapturedImage {
  ref: string
  theme: Theme
  path: string
  /** The layout box in CSS pixels, so the file holds `scale` times as many. */
  width: number
  height: number
  scale: number
}

interface Rendered extends CapturedImage {
  bytes: Buffer
}

/** The page a composite shows, named as its ref and folder parts. */
export interface CompositePage {
  ref: string
  project: string
  name: string
}

/** Space left around the frames of a composite, past each outermost edge. */
export const COMPOSITE_MARGIN = 40

const SCREENSHOT = { animations: 'disabled', caret: 'hide' } as const

/**
 * The file name of one image, `<name>.<theme>.png` at 1x so a path an agent
 * saved stays true, and `<name>.<theme>@<n>x.png` at any other scale.
 */
function imageName(name: string, theme: Theme, scale: number): string {
  return scale === 1 ? `${name}.${theme}.png` : `${name}.${theme}@${scale}x.png`
}

/** Where one frame's capture in one theme lands under `out`. */
export function frameImagePath(
  out: string,
  frame: Pick<FrameRecord, 'project' | 'page' | 'name'>,
  theme: Theme,
  scale = 1,
): string {
  return join(
    out,
    frame.project,
    frame.page,
    imageName(frame.name, theme, scale),
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
 * the far edges. Refuses `capture-too-large` past Chromium's screenshot limit.
 */
export function compositeBounds(
  page: CompositePage,
  frames: Pick<FrameRecord, 'box'>[],
  scale = 1,
): { width: number; height: number; dx: number; dy: number } {
  const left = Math.min(...frames.map(({ box }) => box.x))
  const top = Math.min(...frames.map(({ box }) => box.y))
  const right = Math.max(...frames.map(({ box }) => box.x + box.width))
  const bottom = Math.max(...frames.map(({ box }) => box.y + box.height))
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
 * Captures each frame in each theme at its layout size times `scale`, one PNG apiece. Every
 * image renders before any is written, so a refusal on one frame leaves no
 * half-written set an agent could read as current.
 */
export async function captureFrameImages(
  browser: Browser,
  {
    baseUrl,
    frames,
    themes,
    out,
    scale = 1,
  }: {
    baseUrl: string
    frames: FrameRecord[]
    themes: readonly Theme[]
    out: string
    scale?: number
  },
): Promise<CapturedImage[]> {
  const rendered: Rendered[] = []
  for (const frame of frames) {
    for (const theme of themes) {
      rendered.push({
        ref: frame.ref,
        theme,
        path: frameImagePath(out, frame, theme, scale),
        width: frame.box.width,
        height: frame.box.height,
        scale,
        bytes: await renderFrame(browser, baseUrl, frame, theme, scale),
      })
    }
  }
  return writeImages(rendered)
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
    for (const frame of frames) {
      const bytes = await renderFrame(browser, baseUrl, frame, theme, scale)
      tiles.push(
        `<img src="data:image/png;base64,${bytes.toString('base64')}" style="position:absolute;left:${frame.box.x + bounds.dx}px;top:${frame.box.y + bounds.dy}px;width:${frame.box.width}px;height:${frame.box.height}px">`,
      )
    }
    rendered.push({
      ref: page.ref,
      theme,
      path: compositeImagePath(out, page, theme, scale),
      width: bounds.width,
      height: bounds.height,
      scale,
      bytes: await renderComposite(browser, bounds, theme, tiles, scale),
    })
  }
  return writeImages(rendered)
}

// One frame at a time, so a slow frame never holds several tabs open.
async function renderFrame(
  browser: Browser,
  baseUrl: string,
  frame: FrameRecord,
  theme: Theme,
  scale: number,
): Promise<Buffer> {
  const box = { width: frame.box.width, height: frame.box.height }
  assertScreenshotFits(frame.ref, box, scale)
  const opened = await openFrame(browser, {
    baseUrl,
    ref: frame.ref,
    box,
    theme,
    scale,
  })
  try {
    return await opened.page.screenshot(SCREENSHOT)
  } finally {
    await opened.close()
  }
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
