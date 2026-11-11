import { type MouseEvent, useEffect, useRef } from 'react'

import { useLive } from '@/client/live/store'

/** How long a click on a folder's title waits for a second, which renames instead. */
export const SECOND_CLICK_MS = 300

/**
 * A card's or row's click handler for its folder's title. A click landing on
 * the title waits out a second click before `run` opens the folder, since a
 * double click there renames and must not open the folder on its way. It
 * answers whether it took the click, so the caller skips its own open. A tab
 * that cannot write never renames, so its click opens at once.
 */
export function useTitleClick(run: () => void) {
  const canWrite = useLive((state) => state.canWrite)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (event: MouseEvent): boolean => {
    const onTitle =
      event.target instanceof Element &&
      event.target.closest('[data-folder-title]') !== null
    if (!canWrite || !onTitle) return false
    clearTimeout(timer.current)
    if (event.detail <= 1) timer.current = setTimeout(run, SECOND_CLICK_MS)
    return true
  }
}
