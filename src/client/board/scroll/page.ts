/** Where the page shows, as fractions of its full height. */
export interface ScrollView {
  /** The share of the page above the top of the view. */
  top: number
  /** The share of the page the view shows. */
  size: number
}

/** A frame's page as its rail reads it, null where it cannot be read, as on another origin. */
export function readPage(
  iframe: HTMLIFrameElement,
): { window: Window; root: HTMLElement } | null {
  try {
    const view = iframe.contentWindow
    const root = iframe.contentDocument?.documentElement
    return view && root ? { window: view, root } : null
  } catch {
    return null
  }
}

/** Where a frame's page shows, or null when nothing scrolls or the page cannot be read. */
export function scrollViewOf(iframe: HTMLIFrameElement): ScrollView | null {
  const page = readPage(iframe)
  if (!page) return null
  const { window: view, root } = page
  const full = root.scrollHeight
  if (full <= view.innerHeight + 1) return null
  return { top: view.scrollY / full, size: view.innerHeight / full }
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
  const page = iframe ? readPage(iframe) : null
  const thumb = rail?.querySelector<HTMLElement>('[data-rail-thumb]')
  if (!rail || !page || !thumb) return false
  event.preventDefault()
  const track = rail.getBoundingClientRect()
  const held = thumb.getBoundingClientRect()
  if (event.clientY < held.top || event.clientY > held.bottom) {
    const toward = event.clientY < held.top ? -1 : 1
    page.window.scrollBy({ top: toward * page.window.innerHeight })
    return true
  }
  // The track is the page's full height drawn at the frame's screen height,
  // so a pixel of drag moves the page by that ratio, whatever the zoom.
  const ratio = page.root.scrollHeight / track.height
  const from = { y: event.clientY, scroll: page.window.scrollY }
  rail.setAttribute('data-dragging', '')
  const owner = rail.ownerDocument.defaultView ?? window
  const move = (moved: PointerEvent) => {
    page.window.scrollTo({
      top: from.scroll + (moved.clientY - from.y) * ratio,
    })
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
