import { boundsOf, type Box } from './box'

export type Alignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

export type Axis = 'horizontal' | 'vertical'

type Boxes = Readonly<Record<string, Box>>

/**
 * Aligns every box to an edge or the center of the selection's bounds,
 * which takes two frames or more. Fewer come back unchanged, and every
 * position comes out whole.
 */
export function align(boxes: Boxes, alignment: Alignment): Record<string, Box> {
  const entries = Object.entries(boxes)
  const bounds = boundsOf(entries.map(([, box]) => box))
  if (!bounds || entries.length < 2) return { ...boxes }
  const place = (box: Box): Box => {
    switch (alignment) {
      case 'left':
        return { ...box, x: bounds.x }
      case 'center':
        return {
          ...box,
          x: Math.round(bounds.x + (bounds.width - box.width) / 2),
        }
      case 'right':
        return { ...box, x: bounds.x + bounds.width - box.width }
      case 'top':
        return { ...box, y: bounds.y }
      case 'middle':
        return {
          ...box,
          y: Math.round(bounds.y + (bounds.height - box.height) / 2),
        }
      case 'bottom':
        return { ...box, y: bounds.y + bounds.height - box.height }
    }
  }
  return Object.fromEntries(entries.map(([ref, box]) => [ref, place(box)]))
}

/**
 * Spaces the boxes so the gaps between neighbors along `axis` are equal,
 * keeping the first and last where they are. It takes three frames or more,
 * and fewer come back unchanged. A gap that does not divide evenly is
 * rounded per box, so no box lands off the pixel grid.
 */
export function distribute(boxes: Boxes, axis: Axis): Record<string, Box> {
  const entries = Object.entries(boxes)
  if (entries.length < 3) return { ...boxes }
  const start = (box: Box) => (axis === 'horizontal' ? box.x : box.y)
  const size = (box: Box) => (axis === 'horizontal' ? box.width : box.height)
  const sorted = entries.toSorted(
    ([, a], [, b]) => start(a) - start(b) || size(a) - size(b),
  )
  const [, first] = sorted[0] ?? []
  const [, last] = sorted.at(-1) ?? []
  if (!first || !last) return { ...boxes }
  const span = start(last) + size(last) - start(first)
  const total = sorted.reduce((sum, [, box]) => sum + size(box), 0)
  const gap = (span - total) / (sorted.length - 1)
  const placed: Record<string, Box> = {}
  let cursor = start(first)
  for (const [ref, box] of sorted) {
    const at = Math.round(cursor)
    placed[ref] = axis === 'horizontal' ? { ...box, x: at } : { ...box, y: at }
    cursor += size(box) + gap
  }
  return placed
}
