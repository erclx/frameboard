import { elementAt } from '@/shared/frame-bridge/elements'
import type { FrameRecord } from '@/shared/records/list'

/**
 * A pin's spot, its element's top right corner clamped to the frame, else the
 * frame's, read from the drawn box so a drag passes the box it will draw.
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
