import type { Browser } from 'playwright-core'

import { resizeFrame } from '@/server/board/frames'
import type { RefOptions } from '@/server/board/refs'
import { FrameboardError } from '@/shared/errors'
import type { FitResult } from '@/shared/records/capture'
import type { FrameRecord } from '@/shared/records/list'

import { openFrame } from './render'

interface Reading {
  height: number
  width: number
}

/**
 * Sets a frame's height to its content's own height, measured at its layout
 * width with a 1 px tall viewport and again at its current height. Readings
 * that differ mean the content sizes itself off the viewport, which has no
 * height of its own to fit, so that refuses `fit-unbounded` and writes
 * nothing. The width is reported, never changed.
 */
export async function fitFrame(
  browser: Browser,
  {
    baseUrl,
    frame,
    ...options
  }: RefOptions & { root: string; baseUrl: string; frame: FrameRecord },
): Promise<FitResult> {
  const { width, height } = frame.box
  const short = await measure(browser, baseUrl, frame.ref, { width, height: 1 })
  const current = await measure(browser, baseUrl, frame.ref, { width, height })
  if (short.height !== current.height) {
    throw new FrameboardError(
      'fit-unbounded',
      `${frame.ref} grows with the viewport, measuring ${short.height} px in a 1 px viewport and ${current.height} px at its ${height} px height, so it has no content height to fit. Size it by hand with frame resize.`,
      { ref: frame.ref, heights: [short.height, current.height] },
    )
  }
  return {
    frame: await resizeFrame(options.root, frame.ref, {
      ...options,
      height: short.height,
    }),
    contentHeight: short.height,
    contentWidth: current.width,
    tooWide: current.width > width,
  }
}

async function measure(
  browser: Browser,
  baseUrl: string,
  ref: string,
  box: { width: number; height: number },
): Promise<Reading> {
  const opened = await openFrame(browser, { baseUrl, ref, box, theme: 'light' })
  try {
    return await opened.page.evaluate(readContentSize)
  } finally {
    await opened.close()
  }
}

// Both readings take the furthest bottom edge of any box, flow or out of flow,
// since `scrollHeight` never reads below the viewport and the root's own box
// leaves out absolutely positioned content.
function readContentSize(): Reading {
  const root = document.documentElement
  let bottom = root.getBoundingClientRect().bottom
  for (const element of document.querySelectorAll('body *')) {
    bottom = Math.max(bottom, element.getBoundingClientRect().bottom)
  }
  return {
    height: Math.max(1, Math.ceil(bottom + window.scrollY)),
    width: root.scrollWidth,
  }
}
