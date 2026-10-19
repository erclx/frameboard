import type { FrameRecord } from '@/shared/records/list'

/** A frame's box in canvas pixels, which are the frame's own CSS pixels. */
export type Box = FrameRecord['box']

export interface Point {
  x: number
  y: number
}

export function sameBox(a: Box, b: Box): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

/** The smallest box holding every box given, null for none. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
