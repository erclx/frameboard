import { type RefObject, useEffect } from 'react'

import { subscribe } from './bridge/channel'
import { followPage } from './bridge/shown'

/**
 * Hides a scroll frame's own scrollbar on every page its iframe loads, the
 * frame holding the style while the board keeps the request open, so the
 * board lays the page out at the width capture and the checks do.
 */
export function useHiddenScrollbar(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
  scroll: boolean,
): void {
  useEffect(() => {
    const element = iframe.current
    if (!live || !element || !scroll) return
    return followPage(
      element,
      () => subscribe(element, 'hide-scrollbar', {}, () => {}).close,
    )
  }, [iframe, live, scroll])
}
