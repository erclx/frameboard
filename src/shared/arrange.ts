/** A box in some shared space, being a frame's on the canvas or an element's in its frame. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

function boundsOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export type Alignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

export type Axis = 'horizontal' | 'vertical'

/**
 * Aligns every box to an edge or the center of the selection's bounds,
 * which takes two boxes or more. Fewer come back unchanged, and every
 * position comes out whole.
 */
export function align<B extends Box>(
  boxes: Readonly<Record<string, B>>,
  alignment: Alignment,
): Record<string, B> {
  const entries = Object.entries(boxes)
  const bounds = boundsOf(entries.map(([, box]) => box))
  if (!bounds || entries.length < 2) return { ...boxes }
  const place = (box: B): B => {
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
 * keeping the first and last where they are. It takes three boxes or more,
 * and fewer come back unchanged. A gap that does not divide evenly is
 * rounded per box, so no box lands off the pixel grid.
 */
export function distribute<B extends Box>(
  boxes: Readonly<Record<string, B>>,
  axis: Axis,
): Record<string, B> {
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
  const placed: Record<string, B> = {}
  let cursor = start(first)
  for (const [ref, box] of sorted) {
    const at = Math.round(cursor)
    placed[ref] = axis === 'horizontal' ? { ...box, x: at } : { ...box, y: at }
    cursor += size(box) + gap
  }
  return placed
}
