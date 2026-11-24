import {
  elementAt,
  elementIndex,
  isLocked,
  isUnrendered,
  renderedHash,
} from '@/shared/frame-bridge/elements'
import type { Gap, GapLine, ShownGap } from '@/shared/frame-bridge/gap'
import type { FramePoint, PickedElement } from '@/shared/frame-bridge/messages'

import type { Handlers } from './handler'

/** The page's root and wrapper elements, a point on which picks no element. */
const FRAME_LEVEL = new Set(['html', 'body'])

/**
 * The element under a frame point and each ancestor below `body`, empty over
 * the root or wrapper. `unlocked` starts at the topmost element no lock holds.
 */
function chainAt({ x, y }: FramePoint, unlocked: boolean): PickedElement[] {
  const chain: PickedElement[] = []
  const top = document
    .elementsFromPoint(x, y)
    .find((element) => !(unlocked && isLocked(element)))
  for (
    let element: Element | null = top ?? null;
    element && !FRAME_LEVEL.has(element.localName);
    element = element.parentElement
  ) {
    if (isUnrendered(element)) continue
    const index = elementIndex(document, element)
    if (index !== null) chain.push({ index, tag: element.localName })
  }
  return chain
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
  'model-viewer',
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
 * Whether a placed element can go inside `element`. An empty box is a leaf, so
 * a click on a placed shape lands beside it rather than inside.
 */
function holds(element: Element): boolean {
  if (element.localName === 'body') return true
  if (
    element.namespaceURI !== HTML_NS ||
    LEAVES.has(element.localName) ||
    element.childElementCount === 0
  ) {
    return false
  }
  if (element.closest('svg, math')) return false
  const display = getComputedStyle(element).display
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
  flow: boolean
} {
  const display = style.display
  if (display.endsWith('grid')) return { row: true, reverse: false, flow: true }
  if (!display.endsWith('flex')) {
    return { row: false, reverse: false, flow: false }
  }
  const direction = style.flexDirection
  return {
    row: direction.startsWith('row'),
    reverse: direction.endsWith('reverse'),
    flow: true,
  }
}

/** Where an element placed out of the flow in `container` counts its offsets from, in frame pixels. */
function originOf(container: Element): FramePoint {
  const positioned = (node: Element) => {
    const style = getComputedStyle(node)
    return style.position !== 'static' || style.transform !== 'none'
  }
  let anchor: Element | null =
    container === document.body || container === document.documentElement
      ? null
      : container
  for (let node: Element | null = container; node && !anchor;) {
    if (positioned(node)) anchor = node
    node = node.parentElement
  }
  if (!anchor) return { x: 0 - scrollX, y: 0 - scrollY }
  const box = anchor.getBoundingClientRect()
  return {
    x: box.left + anchor.clientLeft - anchor.scrollLeft,
    y: box.top + anchor.clientTop - anchor.scrollTop,
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
 * The container and gap under a point in the page, a point over an element
 * that cannot hold one taking its parent's gap beside it, read along x in a
 * row or grid and along y otherwise.
 */
export function gapAt(at: FramePoint): Gap | null {
  const body = document.body
  if (!body) return null
  let container: Element | null = document.elementFromPoint(at.x, at.y)
  if (!container || !body.contains(container)) container = body
  while (container && !holds(container)) {
    container = container.parentElement
  }
  const parent = container && elementIndex(document, container)
  if (!container || parent === null || parent === undefined) return null

  const style = getComputedStyle(container)
  const { row, reverse, flow } = flowOf(style)
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
  const padding = (side: string) =>
    Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
  return {
    parent,
    before: ahead?.index ?? null,
    row,
    flow,
    origin: originOf(container),
    room: Math.max(
      0,
      container.clientWidth - padding('left') - padding('right'),
    ),
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

/**
 * The gap a carried element at `index` could move to under a point, null
 * where the move would change nothing or could not land.
 */
function moveGapAt(at: FramePoint, index: number): Gap | null {
  const gap = gapAt(at)
  const element = elementAt(document, index)
  const parent = gap ? elementAt(document, gap.parent) : null
  if (!gap || !element || !parent || element.contains(parent)) return null
  const next = element.nextElementSibling
  const sits =
    parent === element.parentElement &&
    (gap.before === index ||
      gap.before === (next ? elementIndex(document, next) : null))
  return sits ? null : gap
}

/**
 * The color `fill` resolves to in the page, in its theme, since the board's
 * own sheet sets tokens of the same names. Null for a page with no body.
 */
function paintOf(fill: string): string | null {
  if (!document.body) return null
  // Added and taken out in one task, so the page never paints it.
  const probe = document.createElement('div')
  probe.style.background = fill
  document.body.append(probe)
  const color = getComputedStyle(probe).backgroundColor
  probe.remove()
  return color
}

export const gapHandlers: Handlers = {
  'pick-at': ({ at, unlocked }) => ({
    hash: renderedHash(document),
    chain: chainAt(at, unlocked === true),
  }),
  'gap-at': ({ at, carried }): ShownGap | null => {
    const hash = renderedHash(document)
    const gap = carried === undefined ? gapAt(at) : moveGapAt(at, carried)
    return hash && gap ? { hash, gap } : null
  },
  paint: ({ fill }) => paintOf(fill),
}
