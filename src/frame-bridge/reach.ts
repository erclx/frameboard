import { frameElements } from '@/shared/frame-bridge/elements'

import type { Handlers } from './handler'

/**
 * What can take a click in a frame. A `script` counts, since a frame wiring
 * clicks through `addEventListener` needs one to do it.
 */
const TAKES_CLICK =
  'a[href], button, input, select, textarea, summary, [onclick], [tabindex], [contenteditable], video[controls], audio[controls], script'

/** Whether a document holds anything a click reaches, skipping what the frame route injected. */
export function takesClicks(doc: Document): boolean {
  return frameElements(doc).some((element) => element.matches(TAKES_CLICK))
}

/** Whether the page takes a click, which Play's banner reads for every shown frame. */
export const reachHandlers: Handlers = {
  'takes-clicks': () => takesClicks(document),
}
