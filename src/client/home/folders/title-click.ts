import { type MouseEvent, useEffect, useRef } from 'react'

import { useLive } from '@/client/live/store'

/** How long a click on a folder's title waits for a second, which renames instead. */
export const SECOND_CLICK_MS = 300

/**
 * A folder title's click, waiting out a second click before opening, since a
 * double click renames, and opening at once in a tab that cannot write.
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
