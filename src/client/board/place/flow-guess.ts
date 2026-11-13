import type { Box } from '../geometry/box'

/** The flow a wrap gives its container, as `POST /api/frames/wrap` takes it. */
export interface FlowGuess {
  direction: 'row' | 'column'
  /** The space between neighbors, in whole pixels, never below 0. */
  gap: number
}

/**
 * The flow that keeps elements where they sit once wrapped: a row when their
 * centers spread wider than tall, else a column, and the mean space between
 * neighbors along it as the gap, since a flex gap is one value. Overlapping
 * neighbors read as no space at all.
 */
export function guessFlow(boxes: readonly Box[]): FlowGuess {
  const centers = (pick: (box: Box) => number) => boxes.map((box) => pick(box))
  const spread = (values: number[]) =>
    values.length === 0 ? 0 : Math.max(...values) - Math.min(...values)
  const row =
    spread(centers((box) => box.x + box.width / 2)) >=
    spread(centers((box) => box.y + box.height / 2))
  const start = (box: Box) => (row ? box.x : box.y)
  const size = (box: Box) => (row ? box.width : box.height)
  const sorted = boxes.toSorted((a, b) => start(a) - start(b))
  const gaps = sorted.slice(1).map((box, at) => {
    const previous = sorted[at]
    return previous
      ? Math.max(0, start(box) - (start(previous) + size(previous)))
      : 0
  })
  const gap =
    gaps.length === 0
      ? 0
      : Math.round(gaps.reduce((sum, each) => sum + each, 0) / gaps.length)
  return { direction: row ? 'row' : 'column', gap }
}
