import type { FrameRecord } from '@/shared/records/list'

import type { Box, Point } from '../geometry/box'
import { frameAt } from '../geometry/hit'

/** What a right-click on the canvas landed on, with the board point it landed at. */
export type MenuTarget =
  | { kind: 'element'; frame: FrameRecord; at: Point }
  | { kind: 'frame'; frame: FrameRecord; at: Point }
  | { kind: 'reserved'; frame: string; at: Point }
  | { kind: 'canvas'; at: Point }

/** A reserved frame's ref and the box it will land in. */
export interface ReservedBox {
  frame: string
  box: Box
}

/** The selected element's frame ref and its outline box on the canvas. */
export interface SelectedElement {
  frame: string
  box: Box
}

/**
 * What a right-click lands on, the selected element, else the topmost frame or
 * its label strip, else a reserved box, else empty canvas.
 */
export function menuTarget(
  frames: readonly FrameRecord[],
  at: Point,
  zoom: number,
  element: SelectedElement | null,
  reserved: readonly ReservedBox[] = [],
): MenuTarget {
  const holder = element
    ? frames.find((frame) => frame.ref === element.frame && !frame.hidden)
    : undefined
  if (element && holder && inside(element.box, at)) {
    return { kind: 'element', frame: holder, at }
  }
  const frame = frameAt(frames, at, zoom)
  if (frame) return { kind: 'frame', frame, at }
  const held = reserved.findLast((each) => inside(each.box, at))
  return held
    ? { kind: 'reserved', frame: held.frame, at }
    : { kind: 'canvas', at }
}

function inside(box: Box, { x, y }: Point): boolean {
  return (
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height
  )
}
