import { createStore } from 'zustand/vanilla'

import { subscribe } from '../bridge/channel'
import { modeStore } from '../mode'
import {
  type ElementKey,
  type SelectionStore,
  selectionStore,
} from '../selection'
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

/** Stops following the selection and the mode a turn began under. */
let unfollow: (() => void) | null = null

export function stopTurn(): void {
  unfollow?.()
  unfollow = null
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
 * viewer there, answering whether it did. The mode ends once the selection
 * names another element or the board leaves Edit.
 */
export async function turnInPlace(
  container: ParentNode,
  key: ElementKey,
  selection: SelectionStore = selectionStore,
  mode: Pick<typeof modeStore, 'subscribe'> = modeStore,
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
  stopTurn()
  const turning = { frame: key.frame, index: key.index }
  turnStore.setState({ turning })
  // The surface unmounts for a moment on each turn's write, so the mode ends on the selection and never on that.
  const unselect = selection.subscribe(({ element }) => {
    if (!isTurning(turning, element ?? null)) stopTurn()
  })
  const unmode = mode.subscribe((state) => {
    if (state.mode !== 'edit') stopTurn()
  })
  unfollow = () => {
    unselect()
    unmode()
  }
  return true
}

/** How far a drag turns the camera, in degrees a pixel, whatever the model's size on screen. */
const DEGREES_PER_PIXEL = 0.5

/** The angle a drag reaches from `from`, in whole degrees, toward the pointer as the viewer's own orbit drag moves. */
export function turnedBy(from: Angle, drag: { dx: number; dy: number }): Angle {
  const across =
    Math.round(from.theta - Math.round(drag.dx * DEGREES_PER_PIXEL)) % 360
  const down = from.phi - Math.round(drag.dy * DEGREES_PER_PIXEL)
  return {
    theta: across > 180 ? across - 360 : across <= -180 ? across + 360 : across,
    phi: Math.min(180, Math.max(0, Math.round(down))),
  }
}
