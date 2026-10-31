import { useEffect, useState } from 'react'

import type { FrameStyles } from '@/shared/records/elements'

import { elementAt, elementIndex, renderedHash } from '../../frame-dom'
import type { ElementKey } from '../../selection'

/** What the inspector reads off the live element, as the browser computed it. */
export interface LiveElement {
  /** From 0 to 1. */
  opacity: number
  /** The top-left corner's radius in px. */
  radius: number
  /** The computed stack, which names the families and never the token behind them. */
  fontFamily: string
  fontSize: number
  fontWeight: number
  /** In px, null for `normal`, whose height the font decides. */
  lineHeight: number | null
  /** In px, 0 for `normal`. */
  letterSpacing: number
  textAlign: string
  /** The computed `text-decoration-line`, such as `none` or `underline`. */
  textDecorationLine: string
  /** The computed `text-transform`, such as `none` or `uppercase`. */
  textTransform: string
  /** The computed `text-wrap-style`, `auto` unless balanced or pretty. */
  textWrapStyle: string
  /** Whether it clips to one line with an ellipsis, which takes three declarations together. */
  truncated: boolean
  /** The computed `display`, where `inline` is a box nothing clips. */
  display: string
  /** The computed text color, which a `currentcolor` paint shows. */
  color: string
  /** Whether any side draws a border. */
  bordered: boolean
  /** Whether the element or anything in it shows text. */
  holdsText: boolean
  /** Whether it holds text and no element, so its text is edited as a whole. */
  textOnly: boolean
  text: string
  rotation: Rotation
  layout: LiveLayout
  /** Which paints the element's own `style` attribute sets, which a remove drops rather than overrides. */
  inline: {
    color: boolean
    backgroundColor: boolean
    /** Whether the `background` shorthand states it, which a remove has to drop whole. */
    background: boolean
    border: boolean
  }
}

/** How a container lays out what it holds, as the Layout section names it. */
export type Flow = 'block' | 'vertical' | 'horizontal' | 'wrap' | 'grid'

/** What the Layout section reads off the element and its parent, as the browser computed them. */
export interface LiveLayout {
  flow: Flow
  /** Whether it flows inline, as `inline-flex` or `inline-grid`, which a flow pick keeps. */
  inline: boolean
  /** The computed `flex-direction`, `flex-wrap`, `justify-content`, and `align-items`. */
  direction: string
  wrap: string
  justify: string
  alignItems: string
  /** Whether its own `style` sets `justify-content`, which turning Auto gap off drops. */
  ownJustify: boolean
  /** In px, 0 for `normal`. */
  rowGap: number
  columnGap: number
  padding: { top: number; right: number; bottom: number; left: number }
  /** The parent's flow, which decides whether Fill is offered. */
  parent: Flow
  /** The parent's computed `align-items`, which decides how a child hugs across it. */
  parentAlignItems: string
  /** The rendered box in px, before any rotation. */
  width: number
  height: number
}

/** A computed `display`, `flex-direction`, and `flex-wrap` as one flow. */
export function flowOf(display: string, direction: string, wrap: string): Flow {
  if (display === 'grid' || display === 'inline-grid') return 'grid'
  if (display !== 'flex' && display !== 'inline-flex') return 'block'
  if (wrap !== 'nowrap') return 'wrap'
  return direction.startsWith('column') ? 'vertical' : 'horizontal'
}

/** What the Rotation row reads off the element, apart from its `transform`, which it never writes. */
export interface Rotation {
  /** The `rotate` property in degrees, clockwise, null for a 3D rotation the field cannot show. */
  degrees: number | null
  /** The `scale` property's x and y, null for a 3D scale. */
  scale: { x: number; y: number } | null
  /**
   * For each the element's own `style` sets, the value a rule gives under it,
   * so a write landing there drops the element's declaration rather than
   * restating the rule. Absent where the style sets none.
   */
  own: {
    rotate?: number | null
    scale?: { x: number; y: number } | null
  }
  /** Whether the computed `transform` moves the element, which a `rotate` composed before it would swing around. */
  translated: boolean
}

/**
 * The selected element as its frame's live iframe renders it, read again on
 * every load of that frame. While the frame still shows bytes older than the
 * key's hash, as between a hand edit and its reload, the last reading of the
 * same element is kept, so the sections hold their place. Null until the
 * frame shows the element, which a placeholder never does.
 */
export function useLiveElement(key: ElementKey | null): LiveElement | null {
  const [held, setHeld] = useState<{
    at: string
    live: LiveElement
  } | null>(null)
  const frame = key?.frame
  const index = key?.index
  const hash = key?.hash
  const at = key ? `${frame}:${index}` : null

  useEffect(() => {
    if (frame === undefined || index === undefined || at === null) return
    const iframe = document.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(frame)}"] iframe`,
    )
    if (!iframe) return
    const read = () => {
      const doc = iframe.contentDocument
      if (!doc || renderedHash(doc) !== hash) return
      const target = elementAt(doc, index)
      const view = doc.defaultView
      if (!target || !view) return
      setHeld({ at, live: readLive(target, view) })
    }
    read()
    iframe.addEventListener('load', read)
    return () => iframe.removeEventListener('load', read)
  }, [frame, index, hash, at])

  return held?.at === at ? held.live : null
}

/**
 * A frame's `body` as an element key, read off its live iframe on every
 * load, so a frame Fill writes through the element edit. Null until the
 * frame shows stamped bytes, which a placeholder never does.
 */
export function useLiveBody(frame: string): ElementKey | null {
  const [held, setHeld] = useState<ElementKey | null>(null)

  useEffect(() => {
    const scope = `[data-frame="${CSS.escape(frame)}"]`
    const read = (iframe: HTMLIFrameElement | null) => {
      const doc = iframe?.contentDocument
      const hash = doc ? renderedHash(doc) : null
      const index = doc?.body ? elementIndex(doc, doc.body) : null
      if (hash !== null && index !== null) setHeld({ frame, index, hash })
    }
    // The canvas mounts a frame's iframe only once the view settles near it,
    // and swaps it for a placeholder far off, so a load is caught wherever it
    // lands rather than on the iframe present when the frame was selected.
    const loaded = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLIFrameElement && target.closest(scope)) {
        read(target)
      }
    }
    read(document.querySelector<HTMLIFrameElement>(`${scope} iframe`))
    document.addEventListener('load', loaded, true)
    return () => document.removeEventListener('load', loaded, true)
  }, [frame])

  return held?.frame === frame ? held : null
}

function readLive(element: Element, view: Window): LiveElement {
  const style = view.getComputedStyle(element)
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
    holdsText: text.trim() !== '',
    textOnly: element.childElementCount === 0 && text.trim() !== '',
    text,
    rotation: {
      degrees: degreesOf(style.rotate),
      scale: scaleOf(style.scale),
      own: beneathOwn(element, view),
      translated: translates(style.transform),
    },
    layout: readLayout(element, style, view),
    inline: inlinePaints(element),
  }
}

function readLayout(
  element: Element,
  style: CSSStyleDeclaration,
  view: Window,
): LiveLayout {
  const parent = element.parentElement
  const above = parent ? view.getComputedStyle(parent) : null
  // The node is from the frame's realm, where this window's HTMLElement is not its class.
  const node = 'offsetWidth' in element ? (element as HTMLElement) : null
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

const TO_DEGREES: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}

/** A computed `rotate` in degrees, 0 for `none`, null for one about another axis. */
export function degreesOf(rotate: string): number | null {
  if (rotate === 'none' || rotate === '') return 0
  const angle = /^(-?[\d.]+(?:e[+-]?\d+)?)(deg|grad|rad|turn)$/.exec(rotate)
  const unit = angle?.[2] ? TO_DEGREES[angle[2]] : undefined
  if (!angle || unit === undefined) return null
  return Math.round(Number(angle[1]) * unit * 100) / 100
}

/** A computed `scale` as its x and y, 1 and 1 for `none`, null for a 3D scale. */
export function scaleOf(scale: string): { x: number; y: number } | null {
  if (scale === 'none' || scale === '') return { x: 1, y: 1 }
  const factors = scale
    .split(/\s+/)
    .map((factor) =>
      factor.endsWith('%') ? parseFloat(factor) / 100 : Number(factor),
    )
  const [x, y = x, z = 1] = factors
  if (x === undefined || y === undefined || factors.some(Number.isNaN)) {
    return null
  }
  return factors.length > 3 || z !== 1 ? null : { x, y }
}

/** Whether a computed `transform` matrix moves the element, reading any other value as one that may. */
export function translates(transform: string): boolean {
  if (transform === 'none' || transform === '') return false
  const matrix = /^matrix(3d)?\(([^)]*)\)$/.exec(transform)
  if (!matrix?.[2]) return true
  const values = matrix[2].split(',').map(Number)
  const offsets = matrix[1] ? values.slice(12, 15) : values.slice(4, 6)
  return offsets.some((offset) => offset !== 0)
}

/**
 * The `rotate` and `scale` a rule gives the element under its own `style`,
 * read with those declarations lifted off the live node and the attribute
 * put back as it was, so nothing paints between.
 */
function beneathOwn(element: Element, view: Window): Rotation['own'] {
  // The node is from the frame's realm, where this window's HTMLElement is not its class.
  const node = 'style' in element ? (element as HTMLElement) : null
  const rotate = !!node?.style.getPropertyValue('rotate')
  const scale = !!node?.style.getPropertyValue('scale')
  if (!node || (!rotate && !scale)) return {}
  const attribute = node.getAttribute('style')
  node.style.removeProperty('rotate')
  node.style.removeProperty('scale')
  const style = view.getComputedStyle(node)
  const own: Rotation['own'] = {
    ...(rotate ? { rotate: degreesOf(style.rotate) } : {}),
    ...(scale ? { scale: scaleOf(style.scale) } : {}),
  }
  if (attribute === null) node.removeAttribute('style')
  else node.setAttribute('style', attribute)
  return own
}

/** A computed px length to two places. */
function hundredths(length: string): number {
  return Math.round(parseFloat(length) * 100) / 100
}

/** Which paints an element's `style` attribute sets, read off its parsed declarations, where a shorthand shows as its longhands. */
function inlinePaints(element: Element): LiveElement['inline'] {
  const own = 'style' in element ? (element as HTMLElement).style : null
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

/**
 * A frame's styles from `GET /api/frames/styles`, for the element at `index`
 * when one is given. Fetched again whenever `version` changes, which the
 * caller ties to the bytes it shows, and the last answer is kept meanwhile.
 */
export function useFrameStyles(
  ref: string | null,
  index: number | undefined,
  version: string,
  load: typeof fetchStyles = fetchStyles,
): FrameStyles | null {
  const [held, setHeld] = useState<{
    at: string
    styles: FrameStyles
  } | null>(null)
  const at = ref === null ? null : `${ref}:${index ?? ''}`

  useEffect(() => {
    if (ref === null || at === null) return
    let current = true
    void load(ref, index)
      .catch(() => null)
      .then((styles) => {
        if (current && styles) setHeld({ at, styles })
      })
    return () => {
      current = false
    }
  }, [ref, index, version, at, load])

  return held?.at === at ? held.styles : null
}

export async function fetchStyles(
  ref: string,
  index?: number,
): Promise<FrameStyles | null> {
  const query = new URLSearchParams({ ref })
  if (index !== undefined) query.set('index', String(index))
  const response = await fetch(`/api/frames/styles?${query}`)
  const body = (await response.json()) as
    | { ok: true; data: FrameStyles }
    | { ok: false }
  return body.ok ? body.data : null
}

/** An inline declaration a preview replaced, kept so it can be put back. */
interface Replaced {
  element: HTMLElement
  value: string
  priority: string
}

/** Each previewed declaration by element and property, until it is put back or written. */
const previews = new Map<string, Replaced>()

/**
 * Sets one inline declaration on the selected element's live node, so a
 * step shows on the canvas before it is written, or puts the declaration it
 * replaced back on null. A written step needs no putting back, since the
 * frame reloads with the written bytes, so the next preview of a new node
 * forgets the old one.
 */
export function previewStyle(
  key: ElementKey,
  property: string,
  value: string | null,
): void {
  const at = `${key.frame}:${key.index}:${property}`
  const doc = document.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )?.contentDocument
  const target = doc ? elementAt(doc, key.index) : null
  // The node is from the frame's realm, where this window's HTMLElement is not its class.
  const node = target && 'style' in target ? (target as HTMLElement) : null
  const replaced = previews.get(at)
  if (value === null) {
    previews.delete(at)
    if (!replaced || replaced.element !== node || !node) return
    if (replaced.value === '') node.style.removeProperty(property)
    else node.style.setProperty(property, replaced.value, replaced.priority)
    if (node.getAttribute('style') === '') node.removeAttribute('style')
    return
  }
  if (!node) return
  if (replaced?.element !== node) {
    previews.set(at, {
      element: node,
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property),
    })
  }
  node.style.setProperty(property, value, 'important')
}
