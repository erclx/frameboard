import type { Browser, Page } from 'playwright-core'

import { fitHeight } from '@/server/board/frames'
import type { RefOptions } from '@/server/board/refs'
import { FrameboardError } from '@/shared/errors'
import { pageBox, topInset } from '@/shared/frame-device'
import { FRAME_SIZES, referenceHeight } from '@/shared/frame-sizes'
import type { LinkedWidth } from '@/shared/frame-widths'
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
 * Measures content as `frame fit` and the hug step read it, the height at a
 * 1 px viewport and at the reference height, never the box's own. Readings that
 * differ mean the content sizes off the viewport and refuse `fit-unbounded`.
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
  const reference = referenceHeight(box.width)
  const opened = await openFrame(browser, {
    baseUrl,
    ref,
    box: { width: box.width, height: reference },
    theme: 'light',
    fonts,
  })
  let size: ContentSize
  try {
    const { page } = opened
    await page.evaluate(finishAnimations)
    const empty = await page.evaluate(isBodyEmpty)
    let width = box.width
    if (hugWidth && !empty) {
      await page.setViewportSize({ width: HUG_MAX_WIDTH, height: reference })
      await settleResize(page)
      width = Math.min(HUG_MAX_WIDTH, await page.evaluate(readFitWidth))
    }
    const short = await readAt(page, { width, height: 1 })
    const current = await readAt(page, { width, height: reference })
    if (short.height !== current.height) {
      throw new FrameboardError(
        'fit-unbounded',
        `${ref} grows with the viewport, measuring ${short.height} px in a 1 px viewport and ${current.height} px at its ${reference} px reference height, so it has no content height to fit. Size it by hand with frame resize.`,
        { ref, heights: [short.height, current.height] },
      )
    }
    size = { width, height: short.height, contentWidth: current.width, empty }
  } finally {
    await opened.close()
  }
  // Only a load at the answer height shows what a page reading `innerHeight` draws.
  if (size.empty || (size.width === box.width && size.height === reference)) {
    return size
  }
  const confirmed = await readFreshAt(browser, {
    baseUrl,
    ref,
    box: { width: size.width, height: size.height },
  })
  if (confirmed.height !== size.height) {
    throw new FrameboardError(
      'fit-unbounded',
      `${ref} measures ${size.height} px but draws ${confirmed.height} px when opened at that height, so it sizes itself off the viewport it loads in, as a block set once from innerHeight does, and has no content height to fit. Size it by hand with frame resize, or with frame resize --scroll if it is meant to scroll.`,
      { ref, heights: [size.height, confirmed.height] },
    )
  }
  return size
}

/**
 * Reads content in a fresh page at `box` under `fonts: 'wait'`, since the
 * first open already refused a missing face and `require` would wait twice.
 */
async function readFreshAt(
  browser: Browser,
  options: {
    baseUrl: string
    ref: string
    box: { width: number; height: number }
  },
): Promise<Reading> {
  const opened = await openFrame(browser, {
    ...options,
    theme: 'light',
    fonts: 'wait',
  })
  try {
    await opened.page.evaluate(finishAnimations)
    return await opened.page.evaluate(readContentSize)
  } finally {
    await opened.close()
  }
}

/**
 * Sets a frame's height to its content's and hugs it, measuring each linked
 * width too, reporting the width and never changing it.
 */
export async function fitFrame(
  browser: Browser,
  {
    baseUrl,
    frame,
    ...options
  }: RefOptions & { root: string; baseUrl: string; frame: FrameRecord },
): Promise<FitResult> {
  // A phone's page starts under its status bar, so the box holds the page and the bar.
  const measured = await measureContent(browser, {
    baseUrl,
    ref: frame.ref,
    box: pageBox(frame.box, frame.device, frame.turn),
    hugWidth: false,
  })
  const widths: LinkedWidth[] = []
  for (const { width } of frame.widths) {
    const linked = await measureContent(browser, {
      baseUrl,
      ref: frame.ref,
      box: { width, height: referenceHeight(width) },
      hugWidth: false,
    })
    widths.push({ width, height: linked.height })
  }
  return {
    frame: await fitHeight(
      options.root,
      frame.ref,
      measured.height + topInset(frame.device, frame.turn),
      { ...options, widths },
    ),
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
  await settleResize(page)
  return page.evaluate(readContentSize)
}

/**
 * Waits two animation frames after a viewport resize, so a page's `resize`
 * listener has run and its layout settled before the next reading. A reading
 * taken straight after the resize sees the layout from before it.
 */
export async function settleResize(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

// The functions below run in the page, so each carries everything it reads.

/**
 * Jumps every animation with a finite end to that end, leaving a repeating
 * one and a scroll timeline running, since neither has an end to reach.
 */
export function finishAnimations(): void {
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

// The furthest uncropped bottom edge, since `scrollHeight` stops at the viewport,
// with text counted to its line box. Its helpers copy those in the layout check's
// `readLayout`, and the two must agree.
export function readContentSize(): Reading {
  const root = document.documentElement
  const crops = (element: Element) => {
    const style = getComputedStyle(element)
    return style.overflowX !== 'visible' || style.overflowY !== 'visible'
  }
  // Follows the containing block chain, since an ancestor crops only what it contains.
  const anchors = (element: Element) => {
    const style = getComputedStyle(element)
    return style.position !== 'static' || style.transform !== 'none'
  }
  const containingBlock = (element: Element) => {
    const position = getComputedStyle(element).position
    let parent = element.parentElement
    if (position === 'fixed') {
      while (parent && getComputedStyle(parent).transform === 'none') {
        parent = parent.parentElement
      }
      return parent
    }
    if (position !== 'absolute') return parent
    while (parent && !anchors(parent)) parent = parent.parentElement
    return parent
  }
  const isCropped = (element: Element) => {
    for (
      let parent = containingBlock(element);
      parent && parent !== document.body && parent !== root;
      parent = containingBlock(parent)
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
