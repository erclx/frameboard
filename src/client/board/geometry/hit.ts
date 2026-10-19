import type { FrameRecord } from '@/shared/records/list'

import type { Box, Point } from './box'

/** The label strip's height on screen, which a click selects the frame through. */
export const LABEL_HEIGHT = 20

/**
 * The topmost shown frame under a canvas point, the strip above it where its
 * label sits counting as the frame. `frames` comes bottom to top, as the
 * board lists a page, and `zoom` sizes the strip, which keeps its screen size.
 */
export function frameAt(
  frames: readonly FrameRecord[],
  point: Point,
  zoom: number,
): FrameRecord | null {
  const strip = LABEL_HEIGHT / zoom
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]
    if (!frame || frame.hidden) continue
    const { x, y, width, height } = frame.box
    if (
      point.x >= x &&
      point.x <= x + width &&
      point.y >= y - strip &&
      point.y <= y + height
    ) {
      return frame
    }
  }
  return null
}

/** The shown frames a marquee rectangle touches, in the order given. */
export function framesIn(
  frames: readonly FrameRecord[],
  rect: Box,
): FrameRecord[] {
  return frames.filter(
    ({ hidden, box }) =>
      !hidden &&
      box.x <= rect.x + rect.width &&
      box.x + box.width >= rect.x &&
      box.y <= rect.y + rect.height &&
      box.y + box.height >= rect.y,
  )
}
