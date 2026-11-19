import { onShown } from './channel'

/**
 * The hash each live iframe's bridge last announced, null between a page
 * going and the next one starting. Keyed by the iframe, since a swapped one
 * shows a new page from nothing.
 */
const held = new WeakMap<HTMLIFrameElement, string | null>()

type Listener = (iframe: HTMLIFrameElement) => void

const listeners = new Set<Listener>()

function hold(iframe: HTMLIFrameElement, hash: string | null): void {
  if (held.get(iframe) === hash) return
  held.set(iframe, hash)
  for (const listener of listeners) listener(iframe)
}

onShown(hold)

/**
 * The hash of the bytes an iframe shows, read at once from what its bridge
 * announced, or null while it announced none.
 */
export function shownHashOf(iframe: HTMLIFrameElement): string | null {
  return held.get(iframe) ?? null
}

/**
 * Holds `hash` as what an iframe shows ahead of its bridge's word, for a
 * restamp the board sent, telling the listeners.
 */
export function holdShown(iframe: HTMLIFrameElement, hash: string): void {
  hold(iframe, hash)
}

/**
 * Hears each change to any iframe's held hash, being a new page, a restamp,
 * or a page going, until the answer is called.
 */
export function subscribeShown(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Keeps what `open` starts on each page an iframe shows, since a request lives
 * in one document. A restamp keeps the page, and one that never announces opens nothing.
 */
export function followPage(
  iframe: HTMLIFrameElement,
  open: () => () => void,
): () => void {
  let close: (() => void) | null = null
  const sync = () => {
    const shown = shownHashOf(iframe) !== null
    if (shown && !close) {
      close = open()
    } else if (!shown && close) {
      close()
      close = null
    }
  }
  sync()
  const stop = subscribeShown((changed) => {
    if (changed === iframe) sync()
  })
  return () => {
    stop()
    close?.()
    close = null
  }
}

/** The live iframe of a frame in a canvas layer, null for a placeholder. */
function iframeIn(
  container: ParentNode,
  ref: string,
): HTMLIFrameElement | null {
  return container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] iframe`,
  )
}

/**
 * Keeps a subscription open on a frame's iframe while `open` answers one,
 * opening it again for each page, restamp, and iframe swap, since each
 * subscription lives in one document and reads one hash.
 */
export function followFrame(
  container: HTMLElement,
  ref: string,
  open: (iframe: HTMLIFrameElement) => (() => void) | null,
  none: () => void,
): () => void {
  let close: (() => void) | null = null
  let watched: HTMLIFrameElement | null = null
  const reopen = () => {
    close?.()
    watched = iframeIn(container, ref)
    close = watched ? open(watched) : null
    if (!close) none()
  }
  reopen()
  const stop = subscribeShown((iframe) => {
    if (iframe === watched || iframe === iframeIn(container, ref)) reopen()
  })
  // A removed iframe's page goes with no word the board can place, so the swap is watched too.
  const swaps = new MutationObserver(() => {
    if (iframeIn(container, ref) !== watched) reopen()
  })
  swaps.observe(container, { childList: true, subtree: true })
  return () => {
    stop()
    swaps.disconnect()
    close?.()
  }
}
