import { elementAt } from '@/shared/frame-bridge/elements'
import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'

import type { Handlers } from './handler'

/** An inline declaration a preview replaced, kept so it can be put back. */
interface Replaced {
  element: HTMLElement
  value: string
  priority: string
  /**
   * The whole `style` attribute before the preview. A longhand of a shorthand
   * holding `var()` reads as empty, so removing it would strip the shorthand.
   */
  attribute: string | null
}

/**
 * Each previewed declaration by element index and property, until it is put
 * back or written. Keyed with no hash, so a put-back after a restamp still
 * reaches the node it previewed.
 */
const previews = new Map<string, Replaced>()

/**
 * Previews one inline declaration on the node at `index`, or puts the
 * replaced one back on null. A written step needs no putting back, since the
 * page reloads with the written bytes.
 */
function previewStyle(
  index: number,
  property: string,
  value: string | null,
): void {
  const at = `${index}:${property}`
  const target = elementAt(document, index)
  const node = target instanceof HTMLElement ? target : null
  const replaced = previews.get(at)
  if (value === null) {
    previews.delete(at)
    if (!replaced || replaced.element !== node || !node) return
    if (replaced.value !== '') {
      node.style.setProperty(property, replaced.value, replaced.priority)
    } else if (replaced.attribute === null) {
      node.removeAttribute('style')
    } else {
      node.setAttribute('style', replaced.attribute)
    }
    if (node.getAttribute('style') === '') node.removeAttribute('style')
    return
  }
  if (!node) return
  if (replaced?.element !== node) {
    previews.set(at, {
      element: node,
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property),
      attribute: node.getAttribute('style'),
    })
  }
  node.style.setProperty(property, value, 'important')
}

/** The ops that change the live page with nothing written, `announce` telling the board a restamp's hash. */
export function previewHandlers(announce: () => void): Handlers {
  return {
    'preview-style': ({ index, property, value }) => {
      previewStyle(index, property, value)
      return null
    },
    // A write of exactly what the previews show landed with no reload, so a later cancel restores the written value.
    'keep-previews': () => {
      previews.clear()
      return null
    },
    // Moves the frame route's stamp to a hash whose bytes the page already shows.
    restamp: ({ hash }) => {
      const stamp = document.querySelector(`style[${LOOK_MARKER}]`)
      if (!stamp) return false
      stamp.setAttribute(RENDERED_HASH, hash)
      announce()
      return true
    },
  }
}
