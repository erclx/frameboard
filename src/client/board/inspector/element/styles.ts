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
  fontSize: number
  fontWeight: number
  /** In px, null for `normal`, whose height the font decides. */
  lineHeight: number | null
  /** In px, 0 for `normal`. */
  letterSpacing: number
  textAlign: string
  /** The computed text color, which a `currentcolor` paint shows. */
  color: string
  /** Whether any side draws a border. */
  bordered: boolean
  /** Whether the element or anything in it shows text. */
  holdsText: boolean
  /** Whether it holds text and no element, so its text is edited as a whole. */
  textOnly: boolean
  text: string
  /** Which paints the element's own `style` attribute sets, which a remove drops rather than overrides. */
  inline: {
    color: boolean
    backgroundColor: boolean
    /** Whether the `background` shorthand states it, which a remove has to drop whole. */
    background: boolean
    border: boolean
  }
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
    const iframe = document.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(frame)}"] iframe`,
    )
    if (!iframe) return
    const read = () => {
      const doc = iframe.contentDocument
      const hash = doc ? renderedHash(doc) : null
      const index = doc?.body ? elementIndex(doc, doc.body) : null
      if (hash !== null && index !== null) setHeld({ frame, index, hash })
    }
    read()
    iframe.addEventListener('load', read)
    return () => iframe.removeEventListener('load', read)
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
    fontSize: hundredths(style.fontSize),
    fontWeight: Number(style.fontWeight),
    lineHeight:
      style.lineHeight === 'normal' ? null : hundredths(style.lineHeight),
    letterSpacing:
      style.letterSpacing === 'normal' ? 0 : hundredths(style.letterSpacing),
    textAlign: alignOf(style.textAlign, style.direction),
    color: style.color,
    bordered: sides.some((width) => parseFloat(width) > 0),
    holdsText: text.trim() !== '',
    textOnly: element.childElementCount === 0 && text.trim() !== '',
    text,
    inline: inlinePaints(element),
  }
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

/** `start` and `end` as the side they fall on, so one of three buttons lights. */
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
