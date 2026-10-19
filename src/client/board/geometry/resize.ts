import type { Box } from './box'

/**
 * Fits several boxes to a resized selection, each keeping its place and size
 * as a share of the bounds it started in, in whole pixels and at least 1 px.
 */
export function scaleBoxes(
  boxes: Readonly<Record<string, Box>>,
  from: Box,
  to: Box,
): Record<string, Box> {
  const sx = to.width / from.width
  const sy = to.height / from.height
  return Object.fromEntries(
    Object.entries(boxes).map(([ref, box]) => {
      const left = Math.round(to.x + (box.x - from.x) * sx)
      const top = Math.round(to.y + (box.y - from.y) * sy)
      const right = Math.round(to.x + (box.x + box.width - from.x) * sx)
      const bottom = Math.round(to.y + (box.y + box.height - from.y) * sy)
      return [
        ref,
        {
          x: left,
          y: top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        },
      ]
    }),
  )
}

/** A corner handle, named by the compass, which a resize drags while the opposite one stays put. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/**
 * The box after dragging `corner` by a canvas offset. The opposite corner
 * stays pinned, neither side drops under 1 px, and the box comes out in
 * whole pixels, since `layout.json` holds integers.
 */
export function resizeBox(
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
): Box {
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  const left = Math.round(start.x)
  const top = Math.round(start.y)
  const right = Math.round(start.x + start.width)
  const bottom = Math.round(start.y + start.height)
  const x = west ? Math.min(Math.round(left + dx), right - 1) : left
  const y = north ? Math.min(Math.round(top + dy), bottom - 1) : top
  const width = west ? right - x : Math.max(1, Math.round(right + dx) - left)
  const height = north ? bottom - y : Math.max(1, Math.round(bottom + dy) - top)
  return { x, y, width, height }
}
