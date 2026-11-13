import type { Box } from '../geometry/box'

/** The flow a wrap gives its container, as `POST /api/frames/wrap` takes it. */
export interface FlowGuess {
  direction: 'row' | 'column'
  /** The space between neighbors, in whole pixels, never below 0. */
  gap: number
}

/** An element's computed margins, in pixels. */
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * The flow that keeps elements where they sit once wrapped: a row when their
 * centers spread wider than tall, else a column, and the mean space between
 * neighbors along it as the gap, since a flex gap is one value. Overlapping
 * neighbors read as no space at all.
 *
 * `margins` names each box's own, in the order of `boxes`, an absent one
 * reading as none. Flex items keep
 * both margins between them, so a pair's gap is the space left once those
 * are taken out. Margins that collapsed in a block parent sum past the space
 * they shared, which no gap can take back, so that pair reads as 0.
 */
export function guessFlow(
  boxes: readonly Box[],
  margins: readonly (Margins | undefined)[] = [],
): FlowGuess {
  const centers = (pick: (box: Box) => number) => boxes.map((box) => pick(box))
  const spread = (values: number[]) =>
    values.length === 0 ? 0 : Math.max(...values) - Math.min(...values)
  const row =
    spread(centers((box) => box.x + box.width / 2)) >=
    spread(centers((box) => box.y + box.height / 2))
  const start = (box: Box) => (row ? box.x : box.y)
  const size = (box: Box) => (row ? box.width : box.height)
  const sorted = boxes
    .map((box, at) => ({ box, margin: margins[at] ?? NO_MARGINS }))
    .toSorted((a, b) => start(a.box) - start(b.box))
  const gaps = sorted.slice(1).map(({ box, margin }, at) => {
    const previous = sorted[at]
    if (!previous) return 0
    const between =
      (row ? previous.margin.right : previous.margin.bottom) +
      (row ? margin.left : margin.top)
    return Math.max(
      0,
      start(box) - (start(previous.box) + size(previous.box)) - between,
    )
  })
  const gap =
    gaps.length === 0
      ? 0
      : Math.round(gaps.reduce((sum, each) => sum + each, 0) / gaps.length)
  return { direction: row ? 'row' : 'column', gap }
}
