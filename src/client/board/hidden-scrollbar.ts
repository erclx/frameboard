import { type RefObject, useEffect } from 'react'

import { LOOK_MARKER } from '@/shared/theme'

/**
 * Hides a scroll frame's own scrollbar, which takes layout width in desktop
 * Chrome on Linux, so the board lays it out at the width capture and the
 * checks do, their headless browser drawing none.
 */
const HIDDEN_SCROLLBAR = 'html { scrollbar-width: none }'

/**
 * Hides a scroll frame's scrollbar in its iframe on every load, for the
 * frame's own box and each linked width alike. The style is marked as the
 * look injection is, so the element index skips it, and put last in the
 * head, so the look style stays the first marked one.
 */
export function useHiddenScrollbar(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
  scroll: boolean,
): void {
  useEffect(() => {
    const element = iframe.current
    if (!live || !element || !scroll) return
    let injected: HTMLStyleElement | null = null
    const hide = () => {
      const document = element.contentDocument
      if (!document?.head || injected?.ownerDocument === document) return
      injected = document.createElement('style')
      injected.setAttribute(LOOK_MARKER, '')
      injected.textContent = HIDDEN_SCROLLBAR
      document.head.append(injected)
    }
    hide()
    element.addEventListener('load', hide)
    return () => {
      element.removeEventListener('load', hide)
      injected?.remove()
    }
  }, [iframe, live, scroll])
}
