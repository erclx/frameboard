import type { Page } from 'playwright-core'

import { readContentSize } from '@/server/capture/fit'
import type { Finding } from '@/shared/records/check'

import { finding, type RuleDoc } from '../rule'

export const LAYOUT_RULES: RuleDoc[] = [
  {
    id: 'clipped',
    tier: 'browser',
    description:
      'Content reaches past the box the frame renders at, so the board cuts it off',
  },
  {
    id: 'scrollbar',
    tier: 'browser',
    description:
      'An element inside the frame scrolls by more than a pixel, showing a scrollbar in the design',
  },
  {
    id: 'viewport',
    tier: 'browser',
    description:
      'Content sizes itself off the viewport height rather than holding a height of its own, a warning since a full-height screen does it on purpose',
  },
]

/** The frame a browser rule reports on. */
export interface RenderedTarget {
  ref: string
  /** Board-relative, with forward slashes. */
  path: string
  box: { width: number; height: number }
}

/**
 * The slack a reading takes before it counts, so a subpixel edge rounding up
 * is never a finding. One pixel matches what the groundwork spike measured.
 */
const SLACK_PX = 1

/** An element by its address index, the index `inspect` and `edit` take. */
interface Located {
  index: number
  tag: string
}

interface Box extends Located {
  bottom: number
  right: number
  height: number
  /** An ancestor inside the body clips its overflow, so it cannot reach past the box. */
  cropped: boolean
}

interface Scroller extends Located {
  overflowX: number
  overflowY: number
}

interface LayoutRead {
  /** The root's own far edges, which body margin and padding reach. */
  root: { bottom: number; right: number }
  boxes: Box[]
  scrollers: Scroller[]
}

/**
 * Runs the three layout rules on a frame open at its own box, at most one
 * finding each. `viewport` reads a second time with the viewport twice as
 * tall, then puts the box back.
 */
export async function checkLayout(
  page: Page,
  target: RenderedTarget,
): Promise<Finding[]> {
  const { width, height } = target.box
  const content = await page.evaluate(readContentSize)
  const atBox = await page.evaluate(readLayout)
  await page.setViewportSize({ width, height: height * 2 })
  try {
    const tall = await page.evaluate(readContentSize)
    const atTall = await page.evaluate(readLayout)
    return [
      clipped(target, atBox),
      scrollbar(target, atBox),
      viewport(target, content.height, tall.height, atBox, atTall),
    ].filter((found) => found !== null)
  } finally {
    await page.setViewportSize({ width, height })
  }
}

// It reads its own boxes rather than `readContentSize`, since it reaches past
// the width as well and names the boxes that do. The two readers are twins
// that both leave out a box a cropping ancestor hides, so an image cropped on
// purpose reads as neither clipped nor content to fit.
function clipped(target: RenderedTarget, read: LayoutRead): Finding | null {
  const { width, height } = target.box
  const shown = read.boxes.filter((box) => !box.cropped)
  const bottom = Math.max(read.root.bottom, ...shown.map((box) => box.bottom))
  const right = Math.max(read.root.right, ...shown.map((box) => box.right))
  const tall = bottom > height + SLACK_PX
  const wide = right > width + SLACK_PX
  if (!tall && !wide) return null
  const past = shown.filter(
    (box) =>
      (tall && box.bottom > height + SLACK_PX) ||
      (wide && box.right > width + SLACK_PX),
  )
  const reach = [
    tall ? `${bottom} px tall in its ${height} px height` : null,
    wide ? `${right} px wide in its ${width} px width` : null,
  ]
    .filter((part) => part !== null)
    .join(' and ')
  return finding('clipped', {
    frame: target.ref,
    path: target.path,
    message: `${target.ref} is ${reach}, so the board cuts it off${offenders(past, 'past the box')}. ${clippedAdvice(tall, wide, width)}`,
  })
}

// `frame fit` grows the height alone, so it is no answer to a width.
function clippedAdvice(tall: boolean, wide: boolean, width: number): string {
  if (!wide) return 'Run frame fit, or shorten the content.'
  if (!tall) {
    return `Reflow or shorten the content to fit its ${width} px width, since frame fit sets the height alone.`
  }
  return `Run frame fit for the height, and reflow or shorten the content to fit its ${width} px width.`
}

function scrollbar(target: RenderedTarget, read: LayoutRead): Finding | null {
  const scrolling = read.scrollers.filter(
    (scroller) =>
      scroller.overflowX > SLACK_PX || scroller.overflowY > SLACK_PX,
  )
  const [first] = scrolling
  if (!first) return null
  const by = Math.max(first.overflowX, first.overflowY)
  return finding('scrollbar', {
    frame: target.ref,
    path: target.path,
    message: `${target.ref} scrolls inside ${element(first)}, whose content is ${by} px past its box${more(scrolling.length - 1, 'scrolls', 'scroll')}. Size it to its content, or set overflow to hidden.`,
  })
}

function viewport(
  target: RenderedTarget,
  atBox: number,
  atTall: number,
  boxRead: LayoutRead,
  tallRead: LayoutRead,
): Finding | null {
  if (atTall <= atBox + SLACK_PX) return null
  const before = new Map(boxRead.boxes.map((box) => [box.index, box.height]))
  const grown = tallRead.boxes.filter(
    (box) => box.height > (before.get(box.index) ?? box.height) + SLACK_PX,
  )
  return finding('viewport', {
    frame: target.ref,
    path: target.path,
    severity: 'warning',
    message: `${target.ref} grows with the viewport, measuring ${atBox} px at its ${target.box.height} px height and ${atTall} px at twice that${offenders(grown, 'growing')}. Give it a height of its own unless it is a full-height screen on purpose.`,
  })
}

function offenders(found: Located[], doing: string): string {
  const [first] = found
  if (!first) return ''
  return `, ${element(first)} first ${doing}${more(found.length - 1, 'is', 'are')}`
}

function element({ index, tag }: Located): string {
  return `<${tag}> at element ${index}`
}

function more(count: number, one: string, many: string): string {
  if (count === 0) return ''
  return count === 1
    ? ` and 1 more element ${one}`
    : ` and ${count} more elements ${many}`
}

// Runs in the page, so it carries everything it reads. The index counts
// `querySelectorAll('*')` skipping Frameboard's own elements, as inspect's
// reader and the client pick count, so a finding names the index edit takes.
function readLayout(): LayoutRead {
  const boxes: Box[] = []
  const scrollers: Scroller[] = []
  const root = document.documentElement
  const crops = (element: Element) => {
    const style = getComputedStyle(element)
    return style.overflowX !== 'visible' || style.overflowY !== 'visible'
  }
  // A copy of the test in `readContentSize`, which a page function cannot
  // import, so a change to one is a change to both.
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
  // Text laid out past its own block widens no box, as a `nowrap` heading
  // running out of a phone frame, so each element reaches as far as the text
  // it holds directly. An element that crops itself hides that text. A Range
  // reaches text nodes alone, so `::before` and `::after` content stays
  // unmeasured. A text rect is the font's content area, which a line height
  // below it leaves hanging out of the line box on both sides, so the bottom
  // reads to the line box. A copy of `textBottom` in `readContentSize`, so a
  // change to one is a change to both.
  const hangOf = (lineHeight: number, height: number) =>
    lineHeight < height ? (height - lineHeight) / 2 : 0
  const textReach = (element: Element) => {
    let bottom = -Infinity
    let right = -Infinity
    if (crops(element)) return { bottom, right }
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
    for (const child of element.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue
      const range = document.createRange()
      range.selectNodeContents(child)
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 && rect.height === 0) continue
        bottom = Math.max(bottom, rect.bottom - hangOf(lineHeight, rect.height))
        right = Math.max(right, rect.right)
      }
    }
    return { bottom, right }
  }
  // A plain inline element's box is the font's content area too, so a heading
  // wrapping its text in a link hangs out of its line box the way bare text
  // does, less its vertical padding and border, which paint where they sit. A
  // replaced element's box is its own, so it reads as laid out. A copy of
  // `ownBottom` in `readContentSize`, so a change to one is a change to both.
  const replaced = [
    'img',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
    'audio',
  ]
  const ownBottom = (element: Element, rect: DOMRect) => {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      return rect.bottom
    if (replaced.includes(element.localName)) return rect.bottom
    const style = getComputedStyle(element)
    if (style.display !== 'inline') return rect.bottom
    const edges =
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth)
    return (
      rect.bottom - hangOf(parseFloat(style.lineHeight), rect.height - edges)
    )
  }
  const rootRect = root.getBoundingClientRect()
  let index = 0
  for (const node of document.querySelectorAll('*')) {
    if (node.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue
    if (
      node === root ||
      node === document.body ||
      !document.body.contains(node)
    ) {
      continue
    }
    const rect = node.getBoundingClientRect()
    const text = textReach(node)
    if (rect.width === 0 && rect.height === 0 && text.right === -Infinity) {
      continue
    }
    const tag = node.tagName.toLowerCase()
    boxes.push({
      index: own,
      tag,
      bottom: Math.ceil(
        Math.max(ownBottom(node, rect), text.bottom) + window.scrollY,
      ),
      right: Math.ceil(Math.max(rect.right, text.right) + window.scrollX),
      height: Math.round(rect.height),
      cropped: isCropped(node),
    })
    const style = getComputedStyle(node)
    const scrolls = (value: string) => value === 'auto' || value === 'scroll'
    if (scrolls(style.overflowX) || scrolls(style.overflowY)) {
      scrollers.push({
        index: own,
        tag,
        overflowX: scrolls(style.overflowX)
          ? node.scrollWidth - node.clientWidth
          : 0,
        overflowY: scrolls(style.overflowY)
          ? node.scrollHeight - node.clientHeight
          : 0,
      })
    }
  }
  return {
    root: {
      bottom: Math.ceil(rootRect.bottom + window.scrollY),
      right: Math.ceil(rootRect.right + window.scrollX),
    },
    boxes,
    scrollers,
  }
}
