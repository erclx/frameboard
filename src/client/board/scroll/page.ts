import type { ScrollView } from '@/shared/frame-bridge/messages'

import { request } from '../bridge/channel'

/** Where each iframe's page last said it shows, held for a press to read at once. */
const views = new WeakMap<HTMLIFrameElement, ScrollView>()

/** Holds where an iframe's page shows, as its bridge pushed it, or forgets it on null. */
export function holdScrollView(
  iframe: HTMLIFrameElement,
  view: ScrollView | null,
): void {
  if (view) views.set(iframe, view)
  else views.delete(iframe)
}

/** Where a frame's page shows, as its bridge last pushed it, or null when nothing scrolls or it has not answered. */
export function scrollViewOf(iframe: HTMLIFrameElement): ScrollView | null {
  return views.get(iframe) ?? null
}

/**
 * Takes a press on a shown rail under the pointer, dragging its thumb or
 * paging by one screen toward a press on the track, and answers whether it
 * took the press, so the canvas gestures leave it alone.
 */
export function pressRail(layer: ParentNode, event: PointerEvent): boolean {
  if (event.button !== 0) return false
  const rail = railAt(layer, event)
  const iframe =
    rail?.parentElement?.querySelector<HTMLIFrameElement>(':scope > iframe')
  const view = iframe ? scrollViewOf(iframe) : null
  const thumb = rail?.querySelector<HTMLElement>('[data-rail-thumb]')
  if (!rail || !iframe || !view || !thumb) return false
  event.preventDefault()
  const track = rail.getBoundingClientRect()
  const held = thumb.getBoundingClientRect()
  if (event.clientY < held.top || event.clientY > held.bottom) {
    const toward = event.clientY < held.top ? -1 : 1
    void request(iframe, 'scroll-act', { act: 'page', toward })
    return true
  }
  // A drag pixel moves the page by its share of the track, whatever the zoom.
  const from = { y: event.clientY, top: view.top }
  rail.setAttribute('data-dragging', '')
  const owner = rail.ownerDocument.defaultView ?? window
  const move = (moved: PointerEvent) => {
    const top = from.top + (moved.clientY - from.y) / track.height
    void request(iframe, 'scroll-act', { act: 'to', top })
  }
  const end = () => {
    rail.removeAttribute('data-dragging')
    owner.removeEventListener('pointermove', move)
    owner.removeEventListener('pointerup', end)
    owner.removeEventListener('pointercancel', end)
  }
  owner.addEventListener('pointermove', move)
  owner.addEventListener('pointerup', end)
  owner.addEventListener('pointercancel', end)
  return true
}

/**
 * Whether a screen point sits between a frame's right edge and the right edge
 * of the rail it draws, at the rail's height, so the pointer crossing the gap
 * to the rail keeps the frame it belongs to and its rail stays shown.
 */
export function railReach(
  frame: Element,
  point: { clientX: number; clientY: number },
): boolean {
  const rail = frame.querySelector(':scope > [data-rail]')
  if (!rail) return false
  const edge = frame.getBoundingClientRect().right
  const { right, top, bottom } = rail.getBoundingClientRect()
  return (
    point.clientX >= edge &&
    point.clientX <= right &&
    point.clientY >= top &&
    point.clientY <= bottom
  )
}

/**
 * The rail drawn under a screen point, skipping one hidden at rest, which
 * the hit layer's geometry alone would still find.
 */
function railAt(
  layer: ParentNode,
  point: { clientX: number; clientY: number },
): HTMLElement | null {
  for (const rail of layer.querySelectorAll<HTMLElement>('[data-rail]')) {
    const { left, right, top, bottom } = rail.getBoundingClientRect()
    if (
      point.clientX >= left &&
      point.clientX <= right &&
      point.clientY >= top &&
      point.clientY <= bottom &&
      getComputedStyle(rail).visibility === 'visible'
    ) {
      return rail
    }
  }
  return null
}
