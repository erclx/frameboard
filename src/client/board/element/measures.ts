import { useEffect, useSyncExternalStore } from 'react'

import type {
  FrameOverflow,
  MemberMeasure,
} from '@/shared/frame-bridge/live-element'

import { subscribe } from '../bridge/channel'
import { followFrame, shownHashOf } from '../bridge/shown'
import type { ElementKey } from '../selection'

// What the frame pushes about the selection and the page's ghosts, held so a
// press reads it at once. A push lands after the frame lays out, so the
// held copy trails the page by a frame.

/** The selection's members as measured, under the key they were measured for. */
interface HeldSelection {
  frame: string
  hash: string
  members: readonly MemberMeasure[]
}

let selection: HeldSelection | null = null
const ghosts = new Map<string, FrameOverflow>()
const listeners = new Set<() => void>()

function changed(): void {
  for (const listener of listeners) listener()
}

function listen(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the page draws a measured element, as it does not one with display none. */
export function hasBox({ unboxed }: Pick<MemberMeasure, 'unboxed'>): boolean {
  return !unboxed
}

/** The measures held for the named elements, all of one frame at one hash, or null while any is unmeasured. */
export function heldMeasures(
  keys: readonly ElementKey[],
): MemberMeasure[] | null {
  const [first] = keys
  if (!first || !selection) return null
  const { frame, hash, members } = selection
  if (first.frame !== frame || first.hash !== hash) return null
  const found = keys.flatMap(({ index, frame: ref }) => {
    const member = members.find((candidate) => candidate.index === index)
    return member && ref === frame ? [member] : []
  })
  return found.length === keys.length ? found : null
}

/** The ghost held for the element `key` names, past its frame's edge, or null for none. */
export function heldGhost(
  key: ElementKey,
): FrameOverflow['ghosts'][number] | null {
  const held = ghosts.get(key.frame)
  if (held?.hash !== key.hash) return null
  return held.ghosts.find(({ index }) => index === key.index) ?? null
}

/**
 * Measures the named elements, all of one frame at one hash, for as long as
 * the caller is mounted, answering the measures held for them. Null while
 * the frame shows other bytes or misses one.
 */
export function useMeasures(
  container: HTMLElement | null,
  keys: readonly ElementKey[],
): readonly MemberMeasure[] | null {
  const frame = keys[0]?.frame
  const hash = keys[0]?.hash
  const indexes = keys.map(({ index }) => index).join(',')
  useEffect(() => {
    if (!container || frame === undefined || hash === undefined) return
    const wanted = indexes.split(',').map(Number)
    const hold = (members: readonly MemberMeasure[] | null) => {
      selection = members ? { frame, hash, members } : null
      changed()
    }
    const stop = followFrame(
      container,
      frame,
      (iframe) => {
        if (shownHashOf(iframe) !== hash) return null
        // Closing answers the open request with null, which must not land.
        let live = true
        const held = (members: readonly MemberMeasure[] | null) => {
          if (live) hold(members)
        }
        const measure = subscribe(
          iframe,
          'measure',
          { hash, indexes: wanted },
          held,
        )
        void measure.opened.then(held)
        return () => {
          live = false
          measure.close()
        }
      },
      () => hold(null),
    )
    return () => {
      stop()
      if (selection?.frame === frame && selection.hash === hash) hold(null)
    }
  }, [container, frame, hash, indexes])
  return useSyncExternalStore(
    listen,
    () => heldOf(frame, hash, indexes),
    () => null,
  )
}

/** The held members' array for one key, the same array while nothing changed, so a render reads it stably. */
function heldOf(
  frame: string | undefined,
  hash: string | undefined,
  indexes: string,
): readonly MemberMeasure[] | null {
  if (!selection || selection.frame !== frame || selection.hash !== hash) {
    return null
  }
  const held = selection.members.map(({ index }) => index).join(',')
  return held === indexes ? selection.members : null
}

/**
 * Follows one frame's elements past its viewport for as long as the caller is
 * mounted, answering them as held. One caller follows a frame at a time.
 */
export function useGhosts(
  container: HTMLElement | null,
  ref: string,
): FrameOverflow | null {
  useEffect(() => {
    if (!container) return
    const hold = (overflow: FrameOverflow | null) => {
      if (overflow) ghosts.set(ref, overflow)
      else ghosts.delete(ref)
      changed()
    }
    const stop = followFrame(
      container,
      ref,
      (iframe) => {
        let live = true
        const held = (overflow: FrameOverflow | null) => {
          if (live) hold(overflow)
        }
        const overflow = subscribe(iframe, 'overflow', {}, held)
        void overflow.opened.then(held)
        return () => {
          live = false
          overflow.close()
        }
      },
      () => hold(null),
    )
    return () => {
      stop()
      hold(null)
    }
  }, [container, ref])
  const overflowNow = () => ghosts.get(ref) ?? null
  return useSyncExternalStore(listen, overflowNow, overflowNow)
}
