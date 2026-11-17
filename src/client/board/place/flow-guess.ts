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
 * The flow keeping wrapped elements in place, a row or column with the mean
 * neighbor space as its one gap, less both margins flex keeps apart, and 0
 * where margins collapsed in a block parent.
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
