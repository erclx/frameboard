import type { Browser, Page } from 'playwright-core'

import { fitHeight } from '@/server/board/frames'
import type { RefOptions } from '@/server/board/refs'
import { FrameboardError } from '@/shared/errors'
import { FRAME_SIZES } from '@/shared/frame-sizes'
import type { FitResult } from '@/shared/records/capture'
import type { FrameRecord } from '@/shared/records/list'

import { openFrame, type OpenFrameOptions } from './render'

interface Reading {
  height: number
  width: number
}

/** The widest a hugging width grows, past which the layout check reports the content clipped. */
export const HUG_MAX_WIDTH = FRAME_SIZES.desktop.width

/** What one measure of a frame's content reads. */
export interface ContentSize {
  /** The width it settled on, the box's own unless the frame hugs its width. */
  width: number
  /** The content's own height at that width. */
  height: number
  /** How wide the content lays out at that width, past it when it overflows. */
  contentWidth: number
  /** True when the body holds no element and no text, as a fresh skeleton. */
  empty: boolean
}

/**
 * Measures a frame's content the way `frame fit` and the server's hug step
 * both read it, in one page resized between readings. A hugging width takes
 * the content's `fit-content` width up to `HUG_MAX_WIDTH`, and the height is
 * read at that width with a 1 px tall viewport and again at the box's height.
 * Readings that differ mean the content sizes itself off the viewport, which
 * has no height of its own to fit, so that refuses `fit-unbounded`. Finite
 * animations finish before the first reading, so an entrance is read at its
 * settled size.
 */
export async function measureContent(
  browser: Browser,
  {
    baseUrl,
    ref,
    box,
    hugWidth,
    fonts,
  }: {
    baseUrl: string
    ref: string
    box: { width: number; height: number }
    hugWidth: boolean
    /** As `openFrame` takes it, so the server measures what the board shows. */
    fonts?: OpenFrameOptions['fonts']
  },
): Promise<ContentSize> {
  const opened = await openFrame(browser, {
    baseUrl,
    ref,
    box,
    theme: 'light',
    fonts,
  })
  try {
    const { page } = opened
    await page.evaluate(finishAnimations)
    const empty = await page.evaluate(isBodyEmpty)
    let width = box.width
    if (hugWidth && !empty) {
      await page.setViewportSize({ width: HUG_MAX_WIDTH, height: box.height })
      width = Math.min(HUG_MAX_WIDTH, await page.evaluate(readFitWidth))
    }
    const short = await readAt(page, { width, height: 1 })
    const current = await readAt(page, { width, height: box.height })
    if (short.height !== current.height) {
      throw new FrameboardError(
        'fit-unbounded',
        `${ref} grows with the viewport, measuring ${short.height} px in a 1 px viewport and ${current.height} px at its ${box.height} px height, so it has no content height to fit. Size it by hand with frame resize.`,
        { ref, heights: [short.height, current.height] },
      )
    }
    return { width, height: short.height, contentWidth: current.width, empty }
  } finally {
    await opened.close()
  }
}

/**
 * Sets a frame's height to its content's own height at its layout width and
 * turns its height hugging on. The width is reported, never changed.
 */
export async function fitFrame(
  browser: Browser,
  {
    baseUrl,
    frame,
    ...options
  }: RefOptions & { root: string; baseUrl: string; frame: FrameRecord },
): Promise<FitResult> {
  const measured = await measureContent(browser, {
    baseUrl,
    ref: frame.ref,
    box: frame.box,
    hugWidth: false,
  })
  return {
    frame: await fitHeight(options.root, frame.ref, measured.height, options),
    contentHeight: measured.height,
    contentWidth: measured.contentWidth,
    tooWide: measured.contentWidth > frame.box.width,
  }
}

async function readAt(
  page: Page,
  viewport: { width: number; height: number },
): Promise<Reading> {
  await page.setViewportSize(viewport)
  return page.evaluate(readContentSize)
}

// The functions below run in the page, so each carries everything it reads.

function finishAnimations(): void {
  for (const animation of document.getAnimations()) {
    const end = animation.effect?.getComputedTiming().endTime
    if (typeof end === 'number' && Number.isFinite(end)) animation.finish()
  }
}

function isBodyEmpty(): boolean {
  const body = document.body
  return body.children.length === 0 && (body.textContent ?? '').trim() === ''
}

// The root at `fit-content` shrinks to its widest line within the viewport,
// margins included, and the inline style is taken off again so the height
// readings lay out at the width they are given.
function readFitWidth(): number {
  const root = document.documentElement
  const before = root.style.width
  root.style.width = 'fit-content'
  const width = Math.ceil(root.getBoundingClientRect().width)
  root.style.width = before
  return Math.max(1, width)
}

// Both readings take the furthest bottom edge of any box, flow or out of flow,
// since `scrollHeight` never reads below the viewport and the root's own box
// leaves out absolutely positioned content. A box an ancestor inside the body
// crops is left out, since the frame never shows it. Text spilling below its
// own block reaches past that block's box, so it counts unless the block
// crops it, to its line box, since a line height below the font's content area
// leaves the text rect hanging out of the block on both sides, and a plain
// inline element's box hangs the same way. The cropping test, `textBottom`,
// and `ownBottom` are copies of `isCropped`, `textReach`, and `ownBottom` in
// the layout check's `readLayout`, and the two must agree.
export function readContentSize(): Reading {
  const root = document.documentElement
  const crops = (element: Element) => {
    const style = getComputedStyle(element)
    return style.overflowX !== 'visible' || style.overflowY !== 'visible'
  }
  const isCropped = (element: Element) => {
    for (
      let parent = element.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (crops(parent)) return true
    }
    return false
  }
  const hangOf = (lineHeight: number, height: number) =>
    lineHeight < height ? (height - lineHeight) / 2 : 0
  const textBottom = (element: Element) => {
    let bottom = -Infinity
    if (crops(element)) return bottom
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
    for (const child of element.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue
      const range = document.createRange()
      range.selectNodeContents(child)
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 && rect.height === 0) continue
        bottom = Math.max(bottom, rect.bottom - hangOf(lineHeight, rect.height))
      }
    }
    return bottom
  }
  const replaced = [
    'img',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
    'audio',
  ]
  const ownBottom = (element: Element) => {
    const rect = element.getBoundingClientRect()
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      return rect.bottom
    if (replaced.includes(element.localName)) return rect.bottom
    const style = getComputedStyle(element)
    if (style.display !== 'inline') return rect.bottom
    const below =
      parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
    if (below > 0) return rect.bottom
    const above =
      parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth)
    return (
      rect.bottom - hangOf(parseFloat(style.lineHeight), rect.height - above)
    )
  }
  let bottom = root.getBoundingClientRect().bottom
  for (const element of document.querySelectorAll('body *')) {
    if (isCropped(element)) continue
    bottom = Math.max(bottom, ownBottom(element), textBottom(element))
  }
  return {
    height: Math.max(1, Math.ceil(bottom + window.scrollY)),
    width: root.scrollWidth,
  }
}
