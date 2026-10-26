import type { FrameRecord } from '@/shared/records/list'

import { elementAt, elementIndex, renderedHash } from '../frame-dom'
import { type BoardPoint, pickAt } from '../notes/pick'

/** A point inside a live frame, in its own viewport pixels. */
export interface FramePoint {
  x: number
  y: number
}

/** The line the drop line draws at a gap, in frame pixels, zero thick across its axis. */
export interface GapLine {
  x: number
  y: number
  width: number
  height: number
}

/** Where a placed element lands, as the insert route's file indices, and where the line draws. */
export interface Gap {
  parent: number
  /** The child it goes before, or null for the container's end. */
  before: number | null
  /** Whether the container lays its children out along x, where a divider draws vertical. */
  row: boolean
  line: GapLine
}

/** Elements that never hold a placed element, whatever their display. */
const LEAVES = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'iframe',
  'img',
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'picture',
  'script',
  'select',
  'source',
  'style',
  'template',
  'textarea',
  'title',
  'track',
  'video',
  'audio',
  'canvas',
  'wbr',
  // Phrasing content, where a parser closes or moves a block placed inside.
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'button',
  'label',
  'a',
])

const HTML_NS = 'http://www.w3.org/1999/xhtml'

/**
 * Whether a placed element can go inside `element`: a block-level HTML
 * element that already holds elements, no text of its own, and sits in no
 * SVG. An empty box is a leaf, so a click on a placed shape lands beside it
 * rather than inside. The body always can.
 */
function holds(element: Element, view: Window): boolean {
  if (element.localName === 'body') return true
  if (
    element.namespaceURI !== HTML_NS ||
    LEAVES.has(element.localName) ||
    element.childElementCount === 0
  ) {
    return false
  }
  if (element.closest('svg, math')) return false
  const display = view.getComputedStyle(element).display
  if (display.startsWith('inline') || display === 'contents') return false
  return ![...element.childNodes].some(
    (node) =>
      node.nodeType === Node.TEXT_NODE &&
      (node.textContent ?? '').trim() !== '',
  )
}

/** The flow a container lays its children out in, read off its computed style. */
function flowOf(style: CSSStyleDeclaration): {
  row: boolean
  reverse: boolean
} {
  const display = style.display
  if (display.endsWith('grid')) return { row: true, reverse: false }
  if (!display.endsWith('flex')) return { row: false, reverse: false }
  const direction = style.flexDirection
  return {
    row: direction.startsWith('row'),
    reverse: direction.endsWith('reverse'),
  }
}

/** Whether a point sits before a child in its container's reading order. */
function sitsBefore(
  at: FramePoint,
  box: DOMRect,
  row: boolean,
  reverse: boolean,
): boolean {
  if (!row) {
    const middle = box.top + box.height / 2
    return reverse ? at.y > middle : at.y < middle
  }
  // A row that wraps reads line by line, so a point above a child's line is before it.
  if (at.y < box.top) return true
  if (at.y > box.bottom) return false
  const middle = box.left + box.width / 2
  return reverse ? at.x > middle : at.x < middle
}

/**
 * The container and the gap between its children under a point in a live
 * frame, read off the DOM and each container's computed layout. A point over
 * an element that cannot hold one, being a leaf, an inline element, one
 * holding text, or anything in an SVG, takes its parent and the gap beside
 * it. A flex row or a grid reads its gaps along x, and a column or a block
 * along y. Null when the point names no element the file states.
 */
export function gapAt(document: Document, at: FramePoint): Gap | null {
  const view = document.defaultView
  const body = document.body
  if (!view || !body) return null
  let container: Element | null = document.elementFromPoint(at.x, at.y)
  if (!container || !body.contains(container)) container = body
  while (container && !holds(container, view)) {
    container = container.parentElement
  }
  const parent = container && elementIndex(document, container)
  if (!container || parent === null || parent === undefined) return null

  const style = view.getComputedStyle(container)
  const { row, reverse } = flowOf(style)
  const children = [...container.children].flatMap((child) => {
    const index = elementIndex(document, child)
    const box = child.getBoundingClientRect()
    // A child drawing nothing, as one with display none, marks no gap.
    return index !== null && (box.width > 0 || box.height > 0)
      ? [{ index, box }]
      : []
  })
  const next = children.findIndex(({ box }) =>
    sitsBefore(at, box, row, reverse),
  )
  const after = next === -1 ? children.at(-1) : children[next - 1]
  const ahead = next === -1 ? undefined : children[next]
  return {
    parent,
    before: ahead?.index ?? null,
    row,
    line: lineAt(container.getBoundingClientRect(), style, row, reverse, {
      after: after?.box,
      ahead: ahead?.box,
    }),
  }
}

/** The line between the two children a gap sits between, across the container's content box. */
function lineAt(
  box: DOMRect,
  style: CSSStyleDeclaration,
  row: boolean,
  reverse: boolean,
  { after, ahead }: { after?: DOMRect; ahead?: DOMRect },
): GapLine {
  const padding = (side: string) =>
    Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
  const content = {
    left: box.left + padding('left'),
    right: box.right - padding('right'),
    top: box.top + padding('top'),
    bottom: box.bottom - padding('bottom'),
  }
  if (row) {
    // Reversed, the child ahead in the file sits to the right.
    const leftOf = reverse ? ahead : after
    const rightOf = reverse ? after : ahead
    const x =
      leftOf && rightOf
        ? (leftOf.right + rightOf.left) / 2
        : (leftOf?.right ?? rightOf?.left ?? content.left)
    const line = ahead ?? after
    const top = line?.top ?? content.top
    const bottom = line?.bottom ?? content.bottom
    return { x, y: top, width: 0, height: Math.max(0, bottom - top) }
  }
  const above = reverse ? ahead : after
  const below = reverse ? after : ahead
  const y =
    above && below
      ? (above.bottom + below.top) / 2
      : (above?.bottom ?? below?.top ?? content.top)
  return {
    x: content.left,
    y,
    width: Math.max(0, content.right - content.left),
    height: 0,
  }
}

/** The gap under a board point, with the frame it is in and the hash of the bytes that frame shows. */
export interface FrameGap {
  frame: FrameRecord
  hash: string
  gap: Gap
}

/**
 * The gap under a board point in the topmost live frame there, or null over
 * bare canvas, a placeholder, or an iframe that has not finished a load,
 * since then nothing vouches for the indices.
 */
export function gapUnder(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
): FrameGap | null {
  const pick = pickAt(container, frames, at)
  const frame = frames.find((candidate) => candidate.ref === pick?.frame.ref)
  if (!frame) return null
  const shown = shownDocument(container, frame.ref)
  const hash = shown ? renderedHash(shown) : null
  const gap =
    shown && hash
      ? gapAt(shown, { x: at.x - frame.box.x, y: at.y - frame.box.y })
      : null
  return hash && gap ? { frame, hash, gap } : null
}

/**
 * The gap under a board point the element at `index` in frame `ref` could
 * move to, or null where a move would change nothing or could not land: over
 * another frame or bare canvas, inside the element itself, or in the gap it
 * already sits in.
 */
export function moveGapUnder(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  { frame: ref, index }: { frame: string; index: number },
): FrameGap | null {
  const under = gapUnder(container, frames, at)
  const shown = under?.frame.ref === ref ? shownDocument(container, ref) : null
  const element = shown ? elementAt(shown, index) : null
  const parent = shown && under ? elementAt(shown, under.gap.parent) : null
  if (!under || !shown || !element || !parent) return null
  if (element.contains(parent)) return null
  const next = element.nextElementSibling
  const sits =
    parent === element.parentElement &&
    (under.gap.before === index ||
      under.gap.before === (next ? elementIndex(shown, next) : null))
  return sits ? null : under
}

function shownDocument(container: ParentNode, ref: string): Document | null {
  return (
    container.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(ref)}"] iframe`,
    )?.contentDocument ?? null
  )
}
