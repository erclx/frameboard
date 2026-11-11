import { useEffect, useMemo, useRef, useState } from 'react'

import { drawnExtent } from '@/shared/frame-widths'
import type { FrameRecord } from '@/shared/records/list'

/** How many frames one animation frame makes live. */
export const STAGE_BATCH = 6

/** The canvas transform: a translate in screen pixels, then a scale. */
export interface View {
  x: number
  y: number
  k: number
}

export interface Size {
  width: number
  height: number
}

/**
 * The refs of frames worth keeping live: those whose drawn extent, the box
 * and any linked widths beside it, meets the viewport grown by one viewport
 * on every side, so a short pan never shows a placeholder and a frame and its
 * linked boxes mount together. A linear pass, which stays cheap at the frame
 * counts a page holds.
 */
export function mountedRefs(
  frames: readonly (Pick<FrameRecord, 'ref' | 'box'> &
    Partial<Pick<FrameRecord, 'widths'>>)[],
  view: View,
  size: Size,
): Set<string> {
  const width = size.width / view.k
  const height = size.height / view.k
  const left = -view.x / view.k - width
  const top = -view.y / view.k - height
  const right = left + 3 * width
  const bottom = top + 3 * height

  const refs = new Set<string>()
  for (const { ref, box: own, widths } of frames) {
    const box = drawnExtent(own, widths ?? [])
    if (
      box.x < right &&
      box.x + box.width > left &&
      box.y < bottom &&
      box.y + box.height > top
    ) {
      refs.add(ref)
    }
  }
  return refs
}

/**
 * The refs of `frames` ordered by how far each box's center sits from the
 * view's center, nearest first, with a tie going to the lower ref so the
 * order holds whatever order the frames arrive in.
 */
export function byCenter(
  frames: readonly Pick<FrameRecord, 'ref' | 'box'>[],
  view: View,
  size: Size,
): string[] {
  const x = (size.width / 2 - view.x) / view.k
  const y = (size.height / 2 - view.y) / view.k
  return frames
    .map(({ ref, box }) => ({
      ref,
      distance: Math.hypot(
        box.x + box.width / 2 - x,
        box.y + box.height / 2 - y,
      ),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0),
    )
    .map(({ ref }) => ref)
}

export interface StagedLive {
  /** The refs live now: those admitted so far that the target still holds. */
  live: ReadonlySet<string> | null
  /** Whether some of the target still waits for a later animation frame. */
  staging: boolean
}

/**
 * Makes the refs in `order` live a batch of `STAGE_BATCH` per animation
 * frame, in the order given, so a page of frames answers at once with empty
 * boxes and fills from the first ref on. A ref leaving `order` stops being
 * live in the same render rather than waiting a frame. The first batch lands
 * on the next animation frame, never in the commit that changed `order`. A
 * null `order` means nothing is live yet.
 */
export function useStagedLive(order: readonly string[] | null): StagedLive {
  const [admitted, setAdmitted] = useState<ReadonlySet<string>>(() => new Set())
  const admittedRef = useRef(admitted)

  useEffect(() => {
    if (!order) return
    const target = new Set(order)
    let current = new Set(
      [...admittedRef.current].filter((ref) => target.has(ref)),
    )
    admittedRef.current = current
    let handle = 0
    const step = () => {
      const next = new Set(current)
      for (const ref of order) {
        if (next.size - current.size === STAGE_BATCH) break
        next.add(ref)
      }
      current = next
      admittedRef.current = next
      setAdmitted(next)
      if (next.size < order.length) handle = requestAnimationFrame(step)
    }
    if (current.size < order.length) handle = requestAnimationFrame(step)
    return () => cancelAnimationFrame(handle)
  }, [order])

  const live = useMemo(() => {
    if (!order) return null
    const target = new Set(order)
    return new Set([...admitted].filter((ref) => target.has(ref)))
  }, [admitted, order])

  return { live, staging: live !== null && live.size < (order?.length ?? 0) }
}
