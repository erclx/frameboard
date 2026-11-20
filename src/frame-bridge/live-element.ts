import {
  elementAt,
  elementIndex,
  renderedHash,
} from '@/shared/frame-bridge/elements'
import {
  degreesOf,
  flowOf,
  type LiveElement,
  type LiveLayout,
  type Placement,
  type Rotation,
  scaleOf,
  translates,
} from '@/shared/frame-bridge/live-element'
import { STEP_ATTRIBUTES } from '@/shared/present-transition'

import type { Handlers } from './handler'

/** A computed px length to two places. */
export function hundredths(length: string): number {
  return Math.round(parseFloat(length) * 100) / 100
}

/** The flow `element` lays out and its parent lays it in, as the page computes them. */
export function readLayout(
  element: Element,
  style: CSSStyleDeclaration,
): LiveLayout {
  const parent = element.parentElement
  const above = parent ? getComputedStyle(parent) : null
  const node = element instanceof HTMLElement ? element : null
  const px = (length: string) => hundredths(length) || 0
  return {
    flow: flowOf(style.display, style.flexDirection, style.flexWrap),
    inline: style.display.startsWith('inline-'),
    direction: style.flexDirection,
    wrap: style.flexWrap,
    justify: style.justifyContent,
    alignItems: style.alignItems,
    ownJustify: !!node?.style.getPropertyValue('justify-content'),
    rowGap: style.rowGap === 'normal' ? 0 : px(style.rowGap),
    columnGap: style.columnGap === 'normal' ? 0 : px(style.columnGap),
    padding: {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    },
    parent: above
      ? flowOf(above.display, above.flexDirection, above.flexWrap)
      : 'block',
    parentAlignItems: above?.alignItems ?? 'normal',
    width: Math.round(node?.offsetWidth ?? 0),
    height: Math.round(node?.offsetHeight ?? 0),
  }
}

/** The element as the page computes it, every value the inspector's sections read. */
export function readLive(element: Element): LiveElement {
  const style = getComputedStyle(element)
  const text = element.textContent ?? ''
  const sides = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ]
  return {
    opacity: Number(style.opacity),
    radius: Math.round(parseFloat(style.borderTopLeftRadius) || 0),
    fontFamily: style.fontFamily,
    fontSize: hundredths(style.fontSize),
    fontWeight: Number(style.fontWeight),
    lineHeight:
      style.lineHeight === 'normal' ? null : hundredths(style.lineHeight),
    letterSpacing:
      style.letterSpacing === 'normal' ? 0 : hundredths(style.letterSpacing),
    textAlign: alignOf(style.textAlign, style.direction),
    textDecorationLine: style.textDecorationLine,
    textTransform: style.textTransform,
    textWrapStyle: style.getPropertyValue('text-wrap-style') || 'auto',
    truncated:
      style.textOverflow === 'ellipsis' &&
      style.overflowX !== 'visible' &&
      style.getPropertyValue('text-wrap-mode') === 'nowrap',
    display: style.display,
    color: style.color,
    bordered: sides.some((width) => parseFloat(width) > 0),
    borderWidth: sides.every((width) => width === sides[0])
      ? hundredths(style.borderTopWidth)
      : null,
    holdsText: text.trim() !== '' || emptyParagraph(element, text),
    textOnly:
      element.childElementCount === 0 &&
      (text.trim() !== '' || emptyParagraph(element, text)),
    text,
    keepsBreaks: style.whiteSpace !== 'normal' && style.whiteSpace !== 'nowrap',
    rotation: {
      degrees: degreesOf(style.rotate),
      scale: scaleOf(style.scale),
      own: beneathOwn(element),
      translated: translates(style.transform),
      transform: transformOf(element, style),
    },
    placement: placementOf(element, style),
    layout: readLayout(element, style),
    inline: inlinePaints(element),
    step: {
      step: element.getAttribute(STEP_ATTRIBUTES.step),
      effect: element.getAttribute(STEP_ATTRIBUTES.effect),
      start: element.getAttribute(STEP_ATTRIBUTES.start),
    },
  }
}

/**
 * Whether `element` is a paragraph holding nothing yet, which a placed Text
 * opens as, so it reads as text before its first word rather than as a box.
 */
function emptyParagraph(element: Element, text: string): boolean {
  return (
    element.localName === 'p' &&
    element.childElementCount === 0 &&
    text.trim() === ''
  )
}

function placementOf(element: Element, style: CSSStyleDeclaration): Placement {
  const free = style.position === 'absolute' || style.position === 'fixed'
  const size = (length: string) => {
    const value = parseFloat(length)
    return Number.isNaN(value) ? null : Math.round(value)
  }
  const width = size(style.width)
  const height = size(style.height)
  const own = element instanceof HTMLElement ? element.style : null
  const inline = {
    width: own?.getPropertyValue('width') ?? '',
    height: own?.getPropertyValue('height') ?? '',
  }
  // A placed element's computed offsets are the ones it holds, unswung by a rotation.
  if (free && style.left.endsWith('px') && style.top.endsWith('px')) {
    return {
      free,
      left: Math.round(parseFloat(style.left)),
      top: Math.round(parseFloat(style.top)),
      width,
      height,
      inline,
      wordsLeft: null,
    }
  }
  const parent = element.parentElement
  const anchors = (node: Element) => {
    const computed = getComputedStyle(node)
    return computed.position !== 'static' || computed.transform !== 'none'
  }
  let anchor: Element | null = null
  if (style.position !== 'fixed') {
    if (
      !free &&
      parent &&
      parent !== document.body &&
      parent !== document.documentElement
    ) {
      anchor = parent
    } else {
      for (let node = parent; node && !anchor; node = node.parentElement) {
        if (anchors(node)) anchor = node
      }
    }
  }
  // The padding box an anchor's offsets count from, or the frame's own origin.
  let originX = style.position === 'fixed' ? 0 : -scrollX
  let originY = style.position === 'fixed' ? 0 : -scrollY
  if (anchor) {
    const box = anchor.getBoundingClientRect()
    originX = box.left + anchor.clientLeft - anchor.scrollLeft
    originY = box.top + anchor.clientTop - anchor.scrollTop
  }
  const box = element.getBoundingClientRect()
  const marginLeft = parseFloat(style.marginLeft) || 0
  const words = wordsLeft(element, style)
  return {
    free,
    left: Math.round(box.left - originX - marginLeft),
    top: Math.round(box.top - originY - (parseFloat(style.marginTop) || 0)),
    width,
    height,
    inline,
    wordsLeft: words === null ? null : Math.round(words - originX - marginLeft),
  }
}

/**
 * Where a text-only box shrunk to its words would start, or null, since a
 * placement writes no width there and the box's own left would move aligned
 * words to the edge.
 */
function wordsLeft(
  element: Element,
  style: CSSStyleDeclaration,
): number | null {
  // Text alone as the server's `ownText` reads it, so a comment child keeps its box.
  const textAlone =
    element.childNodes.length > 0 &&
    [...element.childNodes].every((node) => node.nodeType === Node.TEXT_NODE) &&
    !!element.textContent?.trim()
  if (!textAlone) return null
  const words = document.createRange()
  words.selectNodeContents(element)
  const inset =
    (parseFloat(style.borderLeftWidth) || 0) +
    (parseFloat(style.paddingLeft) || 0)
  return words.getBoundingClientRect().left - inset
}

/**
 * The `rotate` and `scale` a rule gives the element under its own `style`,
 * read with those declarations lifted off the live node and the attribute
 * put back as it was, so nothing paints between.
 */
function beneathOwn(element: Element): Rotation['own'] {
  const node = element instanceof HTMLElement ? element : null
  const rotate = !!node?.style.getPropertyValue('rotate')
  const scale = !!node?.style.getPropertyValue('scale')
  if (!node || (!rotate && !scale)) return {}
  const attribute = node.getAttribute('style')
  node.style.removeProperty('rotate')
  node.style.removeProperty('scale')
  const style = getComputedStyle(node)
  const own: Rotation['own'] = {
    ...(rotate ? { rotate: degreesOf(style.rotate) } : {}),
    ...(scale ? { scale: scaleOf(style.scale) } : {}),
  }
  if (attribute === null) node.removeAttribute('style')
  else node.setAttribute('style', attribute)
  return own
}

function transformOf(
  element: Element,
  style: CSSStyleDeclaration,
): Rotation['transform'] {
  const own =
    element instanceof HTMLElement
      ? element.style.getPropertyValue('transform')
      : ''
  return {
    own,
    ruled: own === '' && style.transform !== 'none',
    reanchors: style.transform === 'none' && anchorsAbove(element, style),
  }
}

/**
 * Whether an absolute or fixed descendant takes its containing block from
 * above `element`, which a transform on `element` would capture. A positioned
 * `element` already anchors an absolute one, and only a transform a fixed one.
 */
function anchorsAbove(element: Element, style: CSSStyleDeclaration): boolean {
  const positioned = style.position !== 'static'
  for (const child of element.querySelectorAll('*')) {
    const position = getComputedStyle(child).position
    if (position !== 'fixed' && (position !== 'absolute' || positioned)) {
      continue
    }
    let anchored = false
    for (
      let node = child.parentElement;
      node && node !== element && !anchored;
      node = node.parentElement
    ) {
      const computed = getComputedStyle(node)
      anchored =
        computed.transform !== 'none' ||
        (position === 'absolute' && computed.position !== 'static')
    }
    if (!anchored) return true
  }
  return false
}

/** Which paints an element's `style` attribute sets, read off its parsed declarations, where a shorthand shows as its longhands. */
function inlinePaints(element: Element): LiveElement['inline'] {
  const own = element instanceof HTMLElement ? element.style : null
  const names = own
    ? Array.from({ length: own.length }, (_, at) => own.item(at))
    : []
  return {
    color: names.includes('color'),
    backgroundColor: names.includes('background-color'),
    // The parsed declarations show a shorthand only as its longhands, so the attribute is read for it.
    background: /(?:^|;)\s*background\s*:/i.test(
      element.getAttribute('style') ?? '',
    ),
    border: names.some(
      (name) => name.startsWith('border-') && !name.endsWith('-radius'),
    ),
  }
}

/** `start` and `end` as the side they fall on, so one of four buttons lights. */
function alignOf(align: string, direction: string): string {
  if (align === 'start') return direction === 'rtl' ? 'right' : 'left'
  if (align === 'end') return direction === 'rtl' ? 'left' : 'right'
  return align
}

export const liveElementHandlers: Handlers = {
  'live-element': ({ hash, indexes }) => {
    if (renderedHash(document) !== hash) return null
    const found = indexes.flatMap((index) => {
      const element = elementAt(document, index)
      return element ? [readLive(element)] : []
    })
    return found.length === indexes.length ? found : null
  },
  'live-body': () => {
    const hash = renderedHash(document)
    const index = document.body ? elementIndex(document, document.body) : null
    return hash !== null && index !== null ? { index, hash } : null
  },
}
