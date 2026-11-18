import { request } from './bridge/channel'
import { holdShown, shownHashOf } from './bridge/shown'

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
 * Stamps a live frame as rendering `hash`, held on the board at once so a
 * read `RESTAMPED` wakes sees it, for a page already showing those bytes.
 * A page announcing no stamp is left alone.
 */
export function stampRenderedHash(
  iframe: HTMLIFrameElement,
  hash: string,
): void {
  if (shownHashOf(iframe) === null) return
  holdShown(iframe, hash)
  void request(iframe, 'restamp', { hash })
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
