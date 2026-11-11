import { FRAME_GAP } from './frame-sizes'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A width a frame also shows at, with the height its view holds there. */
export interface LinkedWidth {
  width: number
  height: number
}

/**
 * A layout entry's `widths` value as a clean list. Anything but an array of
 * objects each holding a positive integer `width` and `height`, with no width
 * repeated, reads as none, so a value no reader understands never refuses the
 * page's layout.
 */
export function widthsOf(value: unknown): LinkedWidth[] {
  if (!Array.isArray(value)) return []
  const widths: LinkedWidth[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return []
    const { width, height } = item as Record<string, unknown>
    if (!isSize(width) || !isSize(height)) return []
    if (widths.some((linked) => linked.width === width)) return []
    widths.push({ width, height })
  }
  return widths
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/**
 * Where each linked width draws: in a row at the frame's `y`, the first
 * `FRAME_GAP` past the frame's right edge and each next one past the last.
 */
export function linkedBoxes(box: Box, widths: readonly LinkedWidth[]): Box[] {
  const boxes: Box[] = []
  let x = box.x + box.width
  for (const { width, height } of widths) {
    x += FRAME_GAP
    boxes.push({ x, y: box.y, width, height })
    x += width
  }
  return boxes
}

/** The box holding a frame and every linked width it draws, the frame's own with none. */
export function drawnExtent(box: Box, widths: readonly LinkedWidth[]): Box {
  const boxes = linkedBoxes(box, widths)
  const last = boxes.at(-1)
  if (!last) return { ...box }
  return {
    x: box.x,
    y: box.y,
    width: last.x + last.width - box.x,
    height: Math.max(box.height, ...boxes.map(({ height }) => height)),
  }
}
