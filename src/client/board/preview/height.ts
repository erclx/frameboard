/**
 * The content height of the page a same-origin iframe shows, laid out at the
 * iframe's current width, or null when the page sizes itself off the
 * viewport and so has no height of its own. It reads the way the server's
 * fit step does, once with the iframe 1 px tall and again at `height`, since
 * `scrollHeight` never reads below the viewport. Both readings and the
 * restore run in one task, so the collapsed iframe never paints.
 */
export function measureHeight(
  iframe: HTMLIFrameElement,
  height: number,
): number | null {
  const document = iframe.contentDocument
  if (!document?.body) return null
  const before = iframe.style.height
  try {
    iframe.style.height = '1px'
    const short = contentBottom(document)
    iframe.style.height = `${height}px`
    const current = contentBottom(document)
    return short === current ? short : null
  } finally {
    iframe.style.height = before
  }
}

// The furthest bottom edge of any box, flow or out of flow, leaving out a box
// an ancestor inside the body crops. It mirrors `readContentSize` in
// `src/server/capture/fit.ts`, which runs inside a page and so cannot be
// shared, and the two must agree.
function contentBottom(document: Document): number {
  const view = document.defaultView
  if (!view) return 1
  const crops = (element: Element) => {
    const style = view.getComputedStyle(element)
    return style.overflowX !== 'visible' || style.overflowY !== 'visible'
  }
  const isCropped = (element: Element) => {
    for (
      let parent = element.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (crops(parent)) return true
    }
    return false
  }
  let bottom = document.documentElement.getBoundingClientRect().bottom
  for (const element of document.querySelectorAll('body *')) {
    if (isCropped(element)) continue
    bottom = Math.max(bottom, element.getBoundingClientRect().bottom)
  }
  return Math.max(1, Math.ceil(bottom + view.scrollY))
}
