import { type RefObject, useEffect, useState } from 'react'

import { RESTAMPED } from '@/client/board/frame-dom'
import { type PageColors, pageColors } from '@/shared/frame-device'
import type { Theme } from '@/shared/theme'

/**
 * The fill and text color of the page an iframe shows, which the phone's
 * status bar paints, read on each load and each hand edit's restamp and
 * again when the theme flips, null while `active` is off or nothing loaded.
 */
export function usePageColors(
  iframe: RefObject<HTMLIFrameElement | null>,
  active: boolean,
  theme: Theme,
): PageColors | null {
  const [colors, setColors] = useState<PageColors | null>(null)
  useEffect(() => {
    const element = iframe.current
    if (!active || !element) return
    const read = () => {
      const doc = element.contentDocument
      if (!doc || doc.URL === 'about:blank') return
      const next = pageColors(doc)
      setColors((held) =>
        held?.fill === next.fill && held.ink === next.ink ? held : next,
      )
    }
    read()
    element.addEventListener('load', read)
    element.addEventListener(RESTAMPED, read)
    return () => {
      element.removeEventListener('load', read)
      element.removeEventListener(RESTAMPED, read)
    }
  }, [iframe, active, theme])
  return active ? colors : null
}
