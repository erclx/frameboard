import type { FrameRecord } from '@/shared/records/list'

import { elementAt } from './frame-dom'

/**
 * Where a note's pin sits on the board: the top right corner of its element
 * while the live frame under `container` holds it, clamped to the frame's
 * width, else of the frame. The frame's box is the one it is drawn at, so a
 * drag reads the pin's next spot by passing the box it is about to draw.
 */
export function cornerOf(
  frame: Pick<FrameRecord, 'ref' | 'box'>,
  element: number | null,
  container: ParentNode | null,
): { x: number; y: number } {
  const { x, y, width } = frame.box
  const document =
    element === null
      ? null
      : container?.querySelector<HTMLIFrameElement>(
          `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
        )?.contentDocument
  const target =
    document && element !== null ? elementAt(document, element) : null
  if (!target) return { x: x + width, y }
  const rect = target.getBoundingClientRect()
  return { x: x + Math.min(rect.right, width), y: y + Math.max(rect.top, 0) }
}
