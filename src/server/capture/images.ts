import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Browser } from 'playwright-core'

import type { FrameRecord } from '@/shared/records/list'

import { openFrame, type Theme } from './render'

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

/** Where one frame's capture in one theme lands under `out`. */
export function frameImagePath(
  out: string,
  frame: FrameRecord,
  theme: Theme,
): string {
  return join(out, frame.project, frame.page, `${frame.name}.${theme}.png`)
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
  // One at a time, so a slow frame never holds several tabs open.
  for (const frame of frames) {
    for (const theme of themes) {
      const { width, height } = frame.box
      const opened = await openFrame(browser, {
        baseUrl,
        ref: frame.ref,
        box: { width, height },
        theme,
      })
      try {
        rendered.push({
          ref: frame.ref,
          theme,
          path: frameImagePath(out, frame, theme),
          width,
          height,
          bytes: await opened.page.screenshot({
            animations: 'disabled',
            caret: 'hide',
          }),
        })
      } finally {
        await opened.close()
      }
    }
  }
  return writeImages(rendered)
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
