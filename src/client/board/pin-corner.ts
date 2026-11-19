import { useEffect, useSyncExternalStore } from 'react'

import type { PinCorner } from '@/shared/frame-bridge/live-element'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request, subscribe } from './bridge/channel'
import { followFrame } from './bridge/shown'

/** Each frame's element pin corners as its page last pushed them, by file index. */
const corners = new Map<string, ReadonlyMap<number, PinCorner>>()
const listeners = new Set<() => void>()
let version = 0
/** Each followed frame's one-off read of its corners, which a drag's end asks for. */
const rereads = new Set<() => void>()

function hold(ref: string, pushed: readonly PinCorner[] | null): void {
  if (pushed) corners.set(ref, new Map(pushed.map((at) => [at.index, at])))
  else corners.delete(ref)
  version += 1
  for (const listener of listeners) listener()
}

/**
 * Reads every followed frame's corners again, for a drag that moved an
 * element by its style, which no resize or scroll pushes.
 */
export function refreshCorners(): void {
  for (const reread of rereads) reread()
}

/** Hears every pushed corner until the answer is called, so a drag can place its pins again. */
export function subscribeCorners(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A pin's spot, its element's top right corner clamped to the frame, else the
 * frame's, read from the corner the frame last pushed placed on the drawn box,
 * so a drag passes the box it will draw.
 */
export function cornerOf(
  frame: Pick<FrameRecord, 'ref' | 'box' | 'device' | 'turn'>,
  element: number | null,
  container: ParentNode | null,
): { x: number; y: number } {
  const { x, y, width } = frame.box
  const held =
    element === null || !container
      ? undefined
      : corners.get(frame.ref)?.get(element)
  if (!held) return { x: x + width, y }
  // The corner reads in the page, which starts under a phone's status bar.
  const page = pageBox(frame.box, frame.device, frame.turn)
  return {
    x: x + Math.min(held.right, width),
    y: page.y + Math.max(held.top, 0),
  }
}

/**
 * Follows the pin corners of each frame's named elements for as long as the
 * caller is mounted, answering a count that moves on every pushed corner, so
 * a render reads them again. A frame named with no elements opens nothing.
 */
export function usePinCorners(
  container: HTMLElement | null,
  wanted: ReadonlyMap<string, readonly number[]>,
): number {
  const key = [...wanted]
    .filter(([, indexes]) => indexes.length > 0)
    .map(([ref, indexes]) => `${ref}\t${indexes.join(',')}`)
    .toSorted()
    .join('\n')
  useEffect(() => {
    if (!container || key === '') return
    const stops = key.split('\n').map((line) => {
      const [ref = '', list = ''] = line.split('\t')
      const indexes = list.split(',').map(Number)
      const stop = followFrame(
        container,
        ref,
        (iframe) => {
          let live = true
          const held = (pushed: readonly PinCorner[] | null) => {
            if (live) hold(ref, pushed)
          }
          const pins = subscribe(iframe, 'pins', { indexes }, held)
          void pins.opened.then(held)
          const reread = () => {
            void request(iframe, 'pins', { indexes }).then(held)
          }
          rereads.add(reread)
          return () => {
            live = false
            rereads.delete(reread)
            pins.close()
          }
        },
        () => hold(ref, null),
      )
      return () => {
        stop()
        hold(ref, null)
      }
    })
    return () => {
      for (const stop of stops) stop()
    }
  }, [container, key])
  return useSyncExternalStore(
    subscribeCorners,
    () => version,
    () => version,
  )
}
