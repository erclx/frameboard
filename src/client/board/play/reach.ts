import type { FrameRecord } from '@/shared/records/list'

import { request } from '../bridge/channel'
import { shownHashOf, subscribeShown } from '../bridge/shown'

/**
 * What Play can say about a page's shown frames: one takes a click, none
 * does, or it cannot tell, since a frame the canvas culled or one still
 * loading has not answered.
 */
export type Reach = 'clickable' | 'static' | 'unread'

/** Each iframe's answer, by the hash of the page it was asked of, so a newer page reads as unread until it answers. */
const answers = new WeakMap<
  HTMLIFrameElement,
  { hash: string; clicks: boolean }
>()

/** The live iframes the canvas draws, one per frame it did not cull. */
function liveIframes(): HTMLIFrameElement[] {
  return [
    ...document.querySelectorAll<HTMLIFrameElement>('[data-frame] > iframe'),
  ]
}

/** Asks the page an iframe shows whether it takes a click, calling `heard` once the answer is held. */
function ask(iframe: HTMLIFrameElement, heard: () => void): void {
  const hash = shownHashOf(iframe)
  if (hash === null || answers.get(iframe)?.hash === hash) return
  void request(iframe, 'takes-clicks', {}).then((clicks) => {
    if (clicks === null || shownHashOf(iframe) !== hash) return
    answers.set(iframe, { hash, clicks })
    heard()
  })
}

/**
 * Asks every live iframe whether its page takes a click, again on each page,
 * restamp, or new iframe, calling `changed` whenever what `pageReach` reads
 * may have changed, until the answer is called.
 */
export function watchReach(changed: () => void): () => void {
  for (const iframe of liveIframes()) ask(iframe, changed)
  return subscribeShown((iframe) => {
    changed()
    ask(iframe, changed)
  })
}

/** Reads the held answer of each shown frame's live iframe under `root`, as the canvas drew them. */
export function pageReach(
  frames: readonly FrameRecord[],
  root: ParentNode = document,
): Reach {
  const shown = frames.filter((frame) => !frame.hidden)
  if (shown.length === 0) return 'unread'
  let unread = false
  for (const frame of shown) {
    const iframe = root.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(frame.ref)}"] > iframe`,
    )
    const answer = iframe ? answers.get(iframe) : undefined
    if (!iframe || !answer || answer.hash !== shownHashOf(iframe)) {
      unread = true
      continue
    }
    if (answer.clicks) return 'clickable'
  }
  return unread ? 'unread' : 'static'
}
