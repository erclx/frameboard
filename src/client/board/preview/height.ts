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

// The furthest bottom edge of any box, flow or out of flow, or of text
// spilling below its own block to its line box, leaving out what an ancestor
// inside the body or the block itself crops. It mirrors `readContentSize` in
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
  const textBottom = (element: Element) => {
    let bottom = -Infinity
    if (crops(element)) return bottom
    const lineHeight = parseFloat(view.getComputedStyle(element).lineHeight)
    for (const child of element.childNodes) {
      if (child.nodeType !== view.Node.TEXT_NODE) continue
      const range = document.createRange()
      range.selectNodeContents(child)
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 && rect.height === 0) continue
        const hang =
          lineHeight < rect.height ? (rect.height - lineHeight) / 2 : 0
        bottom = Math.max(bottom, rect.bottom - hang)
      }
    }
    return bottom
  }
  let bottom = document.documentElement.getBoundingClientRect().bottom
  for (const element of document.querySelectorAll('body *')) {
    if (isCropped(element)) continue
    bottom = Math.max(
      bottom,
      element.getBoundingClientRect().bottom,
      textBottom(element),
    )
  }
  return Math.max(1, Math.ceil(bottom + view.scrollY))
}
