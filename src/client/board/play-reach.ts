import type { FrameRecord } from '@/shared/records/list'

import { frameElements } from './frame-dom'

/**
 * What can take a click in a frame. A `script` counts, since a frame wiring
 * clicks through `addEventListener` needs one to do it.
 */
const TAKES_CLICK =
  'a[href], button, input, select, textarea, summary, [onclick], [tabindex], [contenteditable], video[controls], audio[controls], script'

/** Whether a frame's document holds anything a click reaches, skipping what the frame route injected. */
export function takesClicks(document: Document): boolean {
  return frameElements(document).some((element) => element.matches(TAKES_CLICK))
}

/**
 * What Play can say about a page's shown frames: one takes a click, none
 * does, or it cannot tell, since a frame the canvas culled or one still
 * loading has no document to read.
 */
export type Reach = 'clickable' | 'static' | 'unread'

/** Reads the live iframe of each shown frame under `root`, as the canvas drew them. */
export function pageReach(
  frames: readonly FrameRecord[],
  root: ParentNode = document,
): Reach {
  const shown = frames.filter((frame) => !frame.hidden)
  if (shown.length === 0) return 'unread'
  let unread = false
  for (const frame of shown) {
    const live = root.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(frame.ref)}"] > iframe`,
    )?.contentDocument
    if (!live || !loaded(live)) {
      unread = true
      continue
    }
    if (takesClicks(live)) return 'clickable'
  }
  return unread ? 'unread' : 'static'
}

/** A new iframe holds a complete `about:blank` until its own page arrives. */
function loaded(document: Document): boolean {
  return document.readyState === 'complete' && document.URL !== 'about:blank'
}
