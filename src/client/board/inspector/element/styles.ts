import { useEffect, useState } from 'react'

import type { FrameStyles } from '@/shared/records/elements'

import { elementAt, renderedHash } from '../../frame-dom'
import type { ElementKey } from '../../selection'

/** What the inspector reads off the live element, as the browser computed it. */
export interface LiveElement {
  /** From 0 to 1. */
  opacity: number
  /** The top-left corner's radius in px. */
  radius: number
  fontSize: number
  fontWeight: number
  textAlign: string
  /** Whether any side draws a border. */
  bordered: boolean
  /** Whether the element or anything in it shows text. */
  holdsText: boolean
  /** Whether it holds text and no element, so its text is edited as a whole. */
  textOnly: boolean
  text: string
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
    fontSize: Math.round(parseFloat(style.fontSize) * 100) / 100,
    fontWeight: Number(style.fontWeight),
    textAlign: alignOf(style.textAlign, style.direction),
    bordered: sides.some((width) => parseFloat(width) > 0),
    holdsText: text.trim() !== '',
    textOnly: element.childElementCount === 0 && text.trim() !== '',
    text,
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
