import { elementAt, renderedHash } from '@/shared/frame-bridge/elements'
import type { FrameBox } from '@/shared/frame-bridge/messages'

import type { Handlers } from './handler'

/** An element's drawn box in the frame's viewport, unrounded. */
function boxOf(element: Element): FrameBox {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
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
}
