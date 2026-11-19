import { type RefObject, useEffect } from 'react'

import type { Theme } from '@/shared/theme'

import { request } from './bridge/channel'
import { followPage } from './bridge/shown'

/**
 * Shows each page an iframe loads in `theme`, sent on a change rather than
 * reloading, and again to a page that loaded after the last one was sent.
 */
export function useThemeInFrame(
  iframe: RefObject<HTMLIFrameElement | null>,
  theme: Theme,
  live = true,
): void {
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    return followPage(element, () => {
      void request(element, 'theme', { theme })
      return () => {}
    })
  }, [iframe, theme, live])
}
