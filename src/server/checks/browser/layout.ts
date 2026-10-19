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

// It reads its own boxes rather than `readContentSize`, which counts content
// a cropping ancestor hides, so an image cropped on purpose would read as
// clipped.
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
    message: `${target.ref} is ${reach}, so the board cuts it off${offenders(past, 'past the box')}. Run frame fit, or shorten the content.`,
  })
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
    if (rect.width === 0 && rect.height === 0) continue
    const tag = node.tagName.toLowerCase()
    boxes.push({
      index: own,
      tag,
      bottom: Math.ceil(rect.bottom + window.scrollY),
      right: Math.ceil(rect.right + window.scrollX),
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
