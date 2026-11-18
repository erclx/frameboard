import { createStore } from 'zustand/vanilla'

import { subscribe } from '../bridge/channel'
import type { ElementKey } from '../selection'
import type { Angle } from './model-staging'

/** A viewer by its frame and file index, which hold through the hash each turn's write moves. */
export type Turning = Pick<ElementKey, 'frame' | 'index'>

/**
 * The viewer a drag turns rather than moves, null outside turn mode. A drag
 * on a selected element already moves it, so turning is a mode a double-click
 * enters and Escape or a press outside leaves.
 */
export const turnStore = createStore<{ turning: Turning | null }>()(() => ({
  turning: null,
}))

export function stopTurn(): void {
  turnStore.setState({ turning: null })
}

/** Whether `key` names the viewer in turn mode. */
export function isTurning(
  turning: Turning | null,
  key: Turning | null,
): boolean {
  return (
    turning !== null &&
    key !== null &&
    turning.frame === key.frame &&
    turning.index === key.index
  )
}

/**
 * Enters turn mode when the frame showing the key's bytes holds a model
 * viewer there, answering whether it did.
 */
export async function turnInPlace(
  container: ParentNode,
  key: ElementKey,
): Promise<boolean> {
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )
  if (!iframe) return false
  const read = subscribe(
    iframe,
    'model',
    { index: key.index, hash: key.hash },
    () => {},
  )
  const reading = await read.opened
  read.close()
  if (!reading) return false
  turnStore.setState({ turning: { frame: key.frame, index: key.index } })
  return true
}

/**
 * The angle a drag reaches from `from`, in whole degrees. A drag across the
 * model's height on screen is one full turn, toward the pointer, as the
 * viewer's own orbit drag moves.
 */
export function turnedBy(
  from: Angle,
  drag: { dx: number; dy: number },
  height: number,
): Angle {
  if (height <= 0) return from
  const perPixel = 360 / height
  const across = Math.round(from.theta - drag.dx * perPixel) % 360
  return {
    theta: across > 180 ? across - 360 : across <= -180 ? across + 360 : across,
    phi: Math.min(180, Math.max(0, Math.round(from.phi - drag.dy * perPixel))),
  }
}
