import type { ScrollView } from '@/shared/frame-bridge/messages'
import { pageColors } from '@/shared/frame-device'
import { LOOK_MARKER, setFrameTheme } from '@/shared/theme'

import type { Handlers } from './handler'

/**
 * Hides a scroll frame's own scrollbar, which takes layout width in desktop
 * Chrome on Linux, so the board lays it out at the width capture and the
 * checks do, their headless browser drawing none.
 */
const HIDDEN_SCROLLBAR = 'html { scrollbar-width: none }'

/** Where the page shows, null while nothing scrolls. */
function scrollView(): ScrollView | null {
  const full = document.documentElement.scrollHeight
  if (full <= innerHeight + 1) return null
  return { top: scrollY / full, size: innerHeight / full }
}

/** The frame's chrome the board draws around it, being its theme, its scroll, its height, and the colors its status bar paints. */
export const chromeHandlers: Handlers = {
  theme: ({ theme }) => {
    setFrameTheme(document.documentElement, theme)
    return true
  },
  // Marked so the element index skips it, and placed last so the look style stays first.
  'hide-scrollbar': (_args, { onClose }) => {
    if (!document.head) return false
    const style = document.createElement('style')
    style.setAttribute(LOOK_MARKER, '')
    style.textContent = HIDDEN_SCROLLBAR
    document.head.append(style)
    onClose(() => style.remove())
    return true
  },
  scroll: (_args, { push, onClose }) => {
    let last = scrollView()
    const read = () => {
      const next = scrollView()
      if (next?.top === last?.top && next?.size === last?.size) return
      last = next
      push(next)
    }
    const resized = new ResizeObserver(read)
    resized.observe(document.documentElement)
    addEventListener('scroll', read)
    addEventListener('resize', read)
    onClose(() => {
      resized.disconnect()
      removeEventListener('scroll', read)
      removeEventListener('resize', read)
    })
    return last
  },
  'scroll-act': (move) => {
    if (move.act === 'page') {
      scrollBy({ top: move.toward * innerHeight })
    } else {
      scrollTo({ top: move.top * document.documentElement.scrollHeight })
    }
    return true
  },
  'content-height': () => (document.body ? contentBottom(document) : null),
  'page-colors': () => pageColors(document),
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
