import {
  elementAt,
  frameElements,
  isLocked,
  renderedHash,
} from '@/shared/frame-bridge/elements'
import {
  type ContainerSizing,
  degreesOf,
  type ElementSize,
  type FrameOverflow,
  type MeasuredBox,
  type MemberMeasure,
  type Offsets,
  type Overflowing,
  type PinCorner,
  type ResizeKind,
  type ResizeRead,
} from '@/shared/frame-bridge/live-element'
import type { FrameBox } from '@/shared/frame-bridge/messages'

import type { Handlers } from './handler'
import { readLayout } from './live-element'

/** The document's own wrappers, which a corner drag never sizes. */
const ROOTS = new Set(['html', 'body'])

/** The tags a corner drag sizes as one picture, a model among them, since its viewer fills its box. */
const MEDIA = new Set(['img', 'video', 'model-viewer'])

/**
 * The corner resize an element's markup takes, null for a divider or a wrapper.
 * Text holds words whose every element child lays out inline, so a `<p>`
 * holding a `<b>` is text.
 */
export function resizeKindOf(element: Element | null): ResizeKind | null {
  if (!element || ROOTS.has(element.localName)) return null
  if (MEDIA.has(element.localName)) return 'media'
  const words = (element.textContent ?? '').trim() !== ''
  if (element.childElementCount > 0) {
    return words && [...element.children].every(laysOutInline)
      ? 'text'
      : 'container'
  }
  if (words) return 'text'
  return element.localName === 'div' ? 'box' : null
}

function laysOutInline(element: Element): boolean {
  const display = getComputedStyle(element).display
  return display === 'inline' || display.startsWith('inline-')
}

/**
 * How a live element takes a corner resize, null for one its `rotate` turns
 * or its transform tilts in 3D, whose outline corners are not its own, and
 * for inline content a width cannot size.
 */
export function readResize(element: Element): ResizeRead | null {
  const kind = resizeKindOf(element)
  const style = getComputedStyle(element)
  if (
    !kind ||
    degreesOf(style.rotate) !== 0 ||
    style.transform.startsWith('matrix3d(')
  ) {
    return null
  }
  if (
    (kind === 'text' || kind === 'container') &&
    (style.display === 'inline' || style.display === 'contents')
  ) {
    return null
  }
  return {
    kind,
    natural: naturalSize(element),
    hugsHeight: kind === 'text' && !statesHeight(element),
    inset: contentBoxInset(style),
    sizing: kind === 'container' ? containerSizing(element, style) : null,
  }
}

const FLEX_PARENTS = new Set(['vertical', 'horizontal', 'wrap'])

function containerSizing(
  element: Element,
  style: CSSStyleDeclaration,
): ContainerSizing {
  const layout = readLayout(element, style)
  return {
    layout,
    fills:
      FLEX_PARENTS.has(layout.parent) && (parseFloat(style.flexGrow) || 0) > 0,
  }
}

function contentBoxInset(style: CSSStyleDeclaration): ElementSize {
  if (style.boxSizing !== 'content-box') return { width: 0, height: 0 }
  const sum = (...lengths: string[]) =>
    lengths.reduce((total, length) => total + (parseFloat(length) || 0), 0)
  return {
    width: sum(
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth,
    ),
    height: sum(
      style.paddingTop,
      style.paddingBottom,
      style.borderTopWidth,
      style.borderBottomWidth,
    ),
  }
}

function naturalSize(element: Element): ElementSize | null {
  const [width, height] =
    element instanceof HTMLImageElement
      ? [element.naturalWidth, element.naturalHeight]
      : element instanceof HTMLVideoElement
        ? [element.videoWidth, element.videoHeight]
        : [0, 0]
  return width > 0 && height > 0 ? { width, height } : null
}

/** A height stated on the element itself, since a rule's height reads as none. */
function statesHeight(element: Element): boolean {
  const height = element instanceof HTMLElement ? element.style.height : ''
  return height !== '' && height !== 'auto'
}

/**
 * A free element's `left` and `top`, null when another group member holds it,
 * since a group drag would otherwise carry it twice.
 */
export function placedIn(
  element: Element,
  group: readonly Element[],
): Offsets | null {
  if (group.some((other) => other !== element && other.contains(element))) {
    return null
  }
  const style = getComputedStyle(element)
  if (style.position !== 'absolute' && style.position !== 'fixed') return null
  const left = parseFloat(style.left)
  const top = parseFloat(style.top)
  return Number.isNaN(left) || Number.isNaN(top) ? null : { left, top }
}

/** The margins the page computed for `element`, 0 where it reads none. */
function marginsOf(element: Element): MemberMeasure['margin'] {
  const style = getComputedStyle(element)
  const px = (value: string) => Number.parseFloat(value) || 0
  return {
    top: px(style.marginTop),
    right: px(style.marginRight),
    bottom: px(style.marginBottom),
    left: px(style.marginLeft),
  }
}

function rounded(element: Element): MeasuredBox {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

/** An element's drawn box in the frame's viewport, unrounded. */
function boxOf(element: Element): FrameBox {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** The named elements of the bytes `hash` names, null while the page shows others or misses one. */
function shownElements(
  hash: string,
  indexes: readonly number[],
): Element[] | null {
  if (renderedHash(document) !== hash) return null
  const found = indexes.flatMap((index) => {
    const element = elementAt(document, index)
    return element ? [element] : []
  })
  return found.length === indexes.length ? found : null
}

function measured(
  indexes: readonly number[],
  elements: readonly Element[],
): MemberMeasure[] {
  return elements.map((element, at) => ({
    index: indexes[at] ?? 0,
    box: rounded(element),
    read: readResize(element),
    placed: placedIn(element, []),
    nested: elements.some(
      (other) => other !== element && other.contains(element),
    ),
    margin: marginsOf(element),
    ...(isLocked(element) ? { locked: true } : {}),
    ...(element.getClientRects().length === 0 ? { unboxed: true } : {}),
  }))
}

/**
 * The slack a box takes before it counts as past the edge, so a subpixel
 * edge rounding up never draws a ghost. The `clipped` check takes the same.
 */
const SLACK_PX = 1

/**
 * The page's elements running past its viewport, not their descendants. A
 * fixed element and one an ancestor crops show nothing past the edge, and a
 * locked one takes no press there.
 */
export function overflowing(): Overflowing[] {
  const body = document.body
  if (!body) return []
  const width = innerWidth
  const height = innerHeight
  const found: Overflowing[] = []
  const reported: Element[] = []
  frameElements(document).forEach((element, index) => {
    if (!body.contains(element) || element === body) return
    if (reported.some((parent) => parent.contains(element))) return
    if (getComputedStyle(element).position === 'fixed') return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const past =
      rect.left < -SLACK_PX ||
      rect.top < -SLACK_PX ||
      rect.right > width + SLACK_PX ||
      rect.bottom > height + SLACK_PX
    if (!past || isLocked(element) || isCropped(element, body)) return
    reported.push(element)
    found.push({ index, box: rounded(element), placed: placedIn(element, []) })
  })
  return found
}

/**
 * Whether an ancestor below the body crops the element, walking the
 * containing block chain as the `clipped` check does.
 */
function isCropped(element: Element, body: HTMLElement): boolean {
  const containingBlock = (node: Element) => {
    let parent = node.parentElement
    if (getComputedStyle(node).position !== 'absolute') return parent
    while (
      parent &&
      getComputedStyle(parent).position === 'static' &&
      getComputedStyle(parent).transform === 'none'
    ) {
      parent = parent.parentElement
    }
    return parent
  }
  for (
    let parent = containingBlock(element);
    parent && parent !== body && body.contains(parent);
    parent = containingBlock(parent)
  ) {
    const style = getComputedStyle(parent)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      return true
    }
  }
  return false
}

function frameOverflow(): FrameOverflow | null {
  const hash = renderedHash(document)
  return hash === null ? null : { hash, ghosts: overflowing() }
}

function pinCorners(indexes: readonly number[]): PinCorner[] {
  return indexes.flatMap((index) => {
    const rect = elementAt(document, index)?.getBoundingClientRect()
    return rect ? [{ index, right: rect.right, top: rect.top }] : []
  })
}

/**
 * Calls `read` on every resize of `targets` or the page, on a scroll, and on
 * a style change when `styles` asks, answering how to stop.
 */
function watch(
  targets: readonly Element[],
  read: () => void,
  styles: boolean,
): () => void {
  const resizes = new ResizeObserver(read)
  for (const target of [...targets, document.documentElement]) {
    resizes.observe(target)
  }
  const mutations = new MutationObserver(read)
  if (styles) {
    for (const target of targets) {
      mutations.observe(target, {
        attributes: true,
        attributeFilter: ['style'],
      })
    }
  }
  addEventListener('scroll', read, true)
  addEventListener('resize', read)
  return () => {
    resizes.disconnect()
    mutations.disconnect()
    removeEventListener('scroll', read, true)
    removeEventListener('resize', read)
  }
}

export const measureHandlers: Handlers = {
  'element-boxes': ({ hash, indexes }) => {
    if (renderedHash(document) !== hash) return null
    return indexes.flatMap((index) => {
      const element = elementAt(document, index)
      const box = element ? boxOf(element) : null
      return box && box.width > 0 && box.height > 0 ? [{ index, box }] : []
    })
  },
  // A group drag previews offsets no resize sees, so a group's styles are watched, and one element's drag shifts its outline on the board, which a pushed offset would move twice.
  measure: ({ hash, indexes }, { push, onClose }) => {
    const elements = shownElements(hash, indexes)
    if (!elements) return null
    const read = () => push(measured(indexes, elements))
    onClose(watch(elements, read, elements.length > 1))
    return measured(indexes, elements)
  },
  overflow: (_args, { push, onClose }) => {
    let pending = 0
    const later = () => {
      if (pending === 0) {
        pending = requestAnimationFrame(() => {
          pending = 0
          push(frameOverflow())
        })
      }
    }
    const styles = new MutationObserver(later)
    styles.observe(document, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    })
    addEventListener('resize', later)
    onClose(() => {
      cancelAnimationFrame(pending)
      styles.disconnect()
      removeEventListener('resize', later)
    })
    return frameOverflow()
  },
  pins: ({ indexes }, { push, onClose }) => {
    const targets = indexes.flatMap((index) => {
      const element = elementAt(document, index)
      return element ? [element] : []
    })
    onClose(watch(targets, () => push(pinCorners(indexes)), false))
    return pinCorners(indexes)
  },
}
