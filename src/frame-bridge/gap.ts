import { elementIndex, renderedHash } from '@/shared/frame-bridge/elements'
import type { PickedElement } from '@/shared/frame-bridge/messages'

import type { Handlers } from './handler'

/** The page's root and wrapper elements, a point on which picks no element. */
const FRAME_LEVEL = new Set(['html', 'body'])

/** The element under a frame point and each ancestor below `body`, empty over the root or wrapper. */
function chainAt(x: number, y: number): PickedElement[] {
  const chain: PickedElement[] = []
  for (
    let element = document.elementFromPoint(x, y);
    element && !FRAME_LEVEL.has(element.localName);
    element = element.parentElement
  ) {
    const index = elementIndex(document, element)
    if (index !== null) chain.push({ index, tag: element.localName })
  }
  return chain
}

export const gapHandlers: Handlers = {
  'pick-at': ({ at }) => ({
    hash: renderedHash(document),
    chain: chainAt(at.x, at.y),
  }),
}
