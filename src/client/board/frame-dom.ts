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
