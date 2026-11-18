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
