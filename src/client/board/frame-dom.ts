import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'

/**
 * A live frame's elements in `querySelectorAll('*')` order, skipping the ones
 * the frame route injected, so an index here is the edit address's index
 * into the file on disk.
 */
export function frameElements(document: Document): Element[] {
  return [...document.querySelectorAll('*')].filter(
    (element) => !element.hasAttribute(LOOK_MARKER),
  )
}

/** The file index of an element in a live frame, or null for an injected one. */
export function elementIndex(
  document: Document,
  element: Element,
): number | null {
  const index = frameElements(document).indexOf(element)
  return index === -1 ? null : index
}

/** The element at a file index in a live frame, or null when the frame holds none there. */
export function elementAt(document: Document, index: number): Element | null {
  return frameElements(document)[index] ?? null
}

/** A frame's own live iframe on the canvas, leaving out its linked widths. */
export function liveIframe(ref: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] iframe`,
  )
}

/**
 * The event a frame's iframe dispatches once its rendered hash is stamped
 * with no load, so a reader that re-reads the page on `load` re-reads it on
 * this too. It does not bubble, so a container listens in the capture phase.
 */
export const RESTAMPED = 'frameboard:restamped'

/**
 * Stamps a live frame as rendering the file `hash` names, as its reload
 * would have, for a page that already shows those bytes, and dispatches
 * `RESTAMPED` on the iframe. A page with no stamp to move is left alone.
 */
export function stampRenderedHash(
  iframe: HTMLIFrameElement,
  hash: string,
): void {
  const stamp = iframe.contentDocument?.querySelector(`style[${LOOK_MARKER}]`)
  if (!stamp) return
  stamp.setAttribute(RENDERED_HASH, hash)
  iframe.dispatchEvent(new Event(RESTAMPED))
}

/**
 * Stamps the file time a frame's iframe rendered, which its `load` listener
 * sets from the board on a reload, for a reload the page took without one.
 */
export function stampRenderedAt(
  iframe: HTMLIFrameElement,
  modifiedAt: string,
): void {
  iframe.dataset.renderedAt = modifiedAt
}

/**
 * The content hash of the file a live frame rendered, read off the stamp the
 * frame route put on its injected style, or null for a document with none.
 */
export function renderedHash(document: Document): string | null {
  return (
    document
      .querySelector(`style[${LOOK_MARKER}]`)
      ?.getAttribute(RENDERED_HASH) ?? null
  )
}
