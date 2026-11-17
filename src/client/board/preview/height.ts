/**
 * The iframe page's content height at its width, null when sized off the
 * viewport, read as the server's fit does in one task so the collapsed iframe
 * never paints.
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

// The furthest uncropped bottom edge, mirroring `readContentSize` in
// `src/server/capture/fit.ts`, which runs in a page and cannot be shared, so
// the two must agree.
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
  const hangOf = (lineHeight: number, height: number) =>
    lineHeight < height ? (height - lineHeight) / 2 : 0
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
        bottom = Math.max(bottom, rect.bottom - hangOf(lineHeight, rect.height))
      }
    }
    return bottom
  }
  const replaced = [
    'img',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
    'audio',
  ]
  const ownBottom = (element: Element) => {
    const rect = element.getBoundingClientRect()
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      return rect.bottom
    if (replaced.includes(element.localName)) return rect.bottom
    const style = view.getComputedStyle(element)
    if (style.display !== 'inline') return rect.bottom
    const below =
      parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
    if (below > 0) return rect.bottom
    const above =
      parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth)
    return (
      rect.bottom - hangOf(parseFloat(style.lineHeight), rect.height - above)
    )
  }
  let bottom = document.documentElement.getBoundingClientRect().bottom
  for (const element of document.querySelectorAll('body *')) {
    if (isCropped(element)) continue
    bottom = Math.max(bottom, ownBottom(element), textBottom(element))
  }
  return Math.max(1, Math.ceil(bottom + view.scrollY))
}
