import { useEffect, useRef } from 'react'

import { markSeen, type UnseenStore, unseenStore } from '@/client/live/unseen'
import type { FrameRecord } from '@/shared/records/list'

import type { Size, View } from '../cull'
import { selectionStore } from '../selection'

/** How long a changed frame sits on screen before it counts as looked at. */
export const DWELL_MS = 1500

/** The page this hook watches for a look, as the canvas settled it. */
export interface Dwelling {
  frames: readonly Pick<FrameRecord, 'ref' | 'box'>[]
  view: View
  size: Size
}

/**
 * Marks a changed frame seen once it is selected, or once at least half its
 * box sits in the viewport for 1.5 seconds while the tab is visible. Never
 * on a timer alone, so a frame the developer has not looked at stays marked.
 */
export function useDwell(
  dwelling: Dwelling | null,
  {
    store = unseenStore,
    doc = document,
  }: { store?: UnseenStore; doc?: Document } = {},
): void {
  const latest = useRef(dwelling)
  const recheck = useRef<() => void>(() => {})

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const stop = (ref: string) => {
      clearTimeout(timers.get(ref))
      timers.delete(ref)
    }
    const check = () => {
      const current = latest.current
      const { unseen } = store.getState()
      const looking =
        current && doc.visibilityState === 'visible'
          ? new Set(
              current.frames
                .filter((frame) => frame.ref in unseen)
                .filter((frame) =>
                  halfShown(frame.box, current.view, current.size),
                )
                .map((frame) => frame.ref),
            )
          : new Set<string>()
      for (const ref of [...timers.keys()]) {
        if (!looking.has(ref)) stop(ref)
      }
      for (const ref of looking) {
        if (timers.has(ref)) continue
        timers.set(
          ref,
          setTimeout(() => {
            timers.delete(ref)
            markSeen(store, ref)
          }, DWELL_MS),
        )
      }
    }
    const seeSelected = () => {
      for (const ref of selectionStore.getState().frames) markSeen(store, ref)
    }

    recheck.current = check
    check()
    seeSelected()
    const stopUnseen = store.subscribe((state, previous) => {
      if (state.unseen === previous.unseen) return
      seeSelected()
      check()
    })
    const stopSelection = selectionStore.subscribe(seeSelected)
    doc.addEventListener('visibilitychange', check)
    return () => {
      stopUnseen()
      stopSelection()
      doc.removeEventListener('visibilitychange', check)
      for (const ref of [...timers.keys()]) stop(ref)
      recheck.current = () => {}
    }
  }, [store, doc])

  // A frame still on screen after the view moves keeps the time it has.
  useEffect(() => {
    latest.current = dwelling
    recheck.current()
  }, [dwelling])
}

/** Whether at least half the box's area sits inside the viewport. */
export function halfShown(
  box: FrameRecord['box'],
  view: View,
  size: Size,
): boolean {
  const left = Math.max(box.x * view.k + view.x, 0)
  const top = Math.max(box.y * view.k + view.y, 0)
  const right = Math.min((box.x + box.width) * view.k + view.x, size.width)
  const bottom = Math.min((box.y + box.height) * view.k + view.y, size.height)
  const shown = Math.max(0, right - left) * Math.max(0, bottom - top)
  const whole = box.width * view.k * box.height * view.k
  return whole > 0 && shown * 2 >= whole
}
