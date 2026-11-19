import { type Structure, structure } from '@/client/live/structure'
import {
  type Device,
  nextTurn,
  type Turn,
  turnsWith,
} from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { reportRefusal } from '../left-panel/page-actions'
import { canvasView } from '../view'

/** Whether a selected frame drawing this device shows a bar under its body: a foldable's poses, or a phone's or tablet's Rotate. */
export function showsDeviceBar(device: Device | null | undefined): boolean {
  return turnsWith(device)
}

/**
 * Turns a frame on to the next of upright, left, and right, sending the
 * target turn so a retried call lands once, and brings the turned box into
 * view on the board, as a fold does.
 */
export function rotateFrame(
  frame: { ref: string; turn?: Turn },
  {
    calls = structure,
    reveal = true,
  }: { calls?: Structure; reveal?: boolean } = {},
): void {
  calls
    .setTurn([frame.ref], nextTurn(frame.turn))
    .then((frames) => {
      const turned = frames.find((each) => each.ref === frame.ref)
      if (reveal && turned) canvasView.reveal(turned.box, { fit: false })
    })
    .catch(reportRefusal('Couldn’t turn the frame'))
}

/**
 * Why a phone, tablet, or foldable cannot turn, matching what the server refuses, or
 * undefined when it can: a locked frame, and one whose extra widths are each
 * an upright preview of their own.
 */
export function turnRefusal(
  frame: Pick<FrameRecord, 'name' | 'locked' | 'widths'>,
): string | undefined {
  if (frame.locked) return `Unlock ${frame.name} to turn it`
  if (frame.widths.length > 0) {
    return `Clear the extra widths on ${frame.name} to turn it`
  }
  return undefined
}
