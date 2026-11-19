import { type RefObject, useEffect, useState } from 'react'

import type { PageColors } from '@/shared/frame-device'
import type { Theme } from '@/shared/theme'

import { request } from '../bridge/channel'
import { shownHashOf, subscribeShown } from '../bridge/shown'

/**
 * The page's fill and text color for a phone's status bar, asked on each page,
 * restamp, and theme flip, null while off. A caller sends the theme first.
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
    // Only the newest ask lands, since an older page's answer can arrive after it.
    let asked = 0
    const read = () => {
      if (shownHashOf(element) === null) return
      const ask = (asked += 1)
      void request(element, 'page-colors', {}).then((next) => {
        if (ask !== asked || !next) return
        setColors((held) =>
          held?.fill === next.fill && held.ink === next.ink ? held : next,
        )
      })
    }
    read()
    const stop = subscribeShown((changed) => {
      if (changed === element) read()
    })
    return () => {
      asked += 1
      stop()
    }
  }, [iframe, active, theme])
  return active ? colors : null
}
