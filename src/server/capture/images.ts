import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Browser } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import { openFrame } from './render'

export interface CapturedImage {
  ref: string
  theme: Theme
  path: string
  width: number
  height: number
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
/** Chromium's screenshot surface stops at this many pixels on either side. */
export const MAX_COMPOSITE_SIDE = 16384

const SCREENSHOT = { animations: 'disabled', caret: 'hide' } as const

/** Where one frame's capture in one theme lands under `out`. */
export function frameImagePath(
  out: string,
  frame: FrameRecord,
  theme: Theme,
): string {
  return join(out, frame.project, frame.page, `${frame.name}.${theme}.png`)
}

/** Where a page's composite in one theme lands under `out`. */
export function compositeImagePath(
  out: string,
  page: CompositePage,
  theme: Theme,
): string {
  return join(out, page.project, `${page.name}.${theme}.png`)
}

/**
 * The composite's size and the shift placing each frame in it, so the
 * leftmost and topmost frames sit one margin in and one margin is left past
 * the far edges. Refuses `capture-too-large` past Chromium's screenshot limit.
 */
export function compositeBounds(
  page: CompositePage,
  frames: Pick<FrameRecord, 'box'>[],
): { width: number; height: number; dx: number; dy: number } {
  const left = Math.min(...frames.map(({ box }) => box.x))
  const top = Math.min(...frames.map(({ box }) => box.y))
  const right = Math.max(...frames.map(({ box }) => box.x + box.width))
  const bottom = Math.max(...frames.map(({ box }) => box.y + box.height))
  const width = right - left + 2 * COMPOSITE_MARGIN
  const height = bottom - top + 2 * COMPOSITE_MARGIN
  if (width > MAX_COMPOSITE_SIDE || height > MAX_COMPOSITE_SIDE) {
    throw new FrameboardError(
      'capture-too-large',
      `A composite of ${page.ref} would be ${width} by ${height} px, past the ${MAX_COMPOSITE_SIDE} px a browser screenshot holds. Capture its frames one by one instead.`,
      { ref: page.ref, width, height, max: MAX_COMPOSITE_SIDE },
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
 * Captures each frame in each theme at its layout size, one PNG apiece. Every
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
  }: {
    baseUrl: string
    frames: FrameRecord[]
    themes: readonly Theme[]
    out: string
  },
): Promise<CapturedImage[]> {
  const rendered: Rendered[] = []
  for (const frame of frames) {
    for (const theme of themes) {
      rendered.push({
        ref: frame.ref,
        theme,
        path: frameImagePath(out, frame, theme),
        width: frame.box.width,
        height: frame.box.height,
        bytes: await renderFrame(browser, baseUrl, frame, theme),
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
  }: {
    baseUrl: string
    page: CompositePage
    frames: FrameRecord[]
    themes: readonly Theme[]
    out: string
  },
): Promise<CapturedImage[]> {
  const bounds = compositeBounds(page, frames)
  const rendered: Rendered[] = []
  for (const theme of themes) {
    const tiles: string[] = []
    for (const frame of frames) {
      const bytes = await renderFrame(browser, baseUrl, frame, theme)
      tiles.push(
        `<img src="data:image/png;base64,${bytes.toString('base64')}" style="position:absolute;left:${frame.box.x + bounds.dx}px;top:${frame.box.y + bounds.dy}px;width:${frame.box.width}px;height:${frame.box.height}px">`,
      )
    }
    rendered.push({
      ref: page.ref,
      theme,
      path: compositeImagePath(out, page, theme),
      width: bounds.width,
      height: bounds.height,
      bytes: await renderComposite(browser, bounds, theme, tiles),
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
): Promise<Buffer> {
  const opened = await openFrame(browser, {
    baseUrl,
    ref: frame.ref,
    box: { width: frame.box.width, height: frame.box.height },
    theme,
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
): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width, height },
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
