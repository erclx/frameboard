import type { Box } from './box'

/** How near, in screen pixels, an edge or center has to come before it snaps. */
export const SNAP_DISTANCE = 6

/** A guide line in canvas pixels, vertical at `x = at` or horizontal at `y = at`, running `from` to `to` along the other axis. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

/** The space between the moving box and the frame it lined up with, drawn as a short line and a tag. */
export interface Gap {
  axis: 'x' | 'y'
  /** Where the line sits on the other axis. */
  at: number
  from: number
  to: number
}

export interface Snap {
  box: Box
  guides: Guide[]
  gaps: Gap[]
}

/** Which edges of a box a gesture moves on one axis: all three for a move, one for a resize. */
type Lines = readonly ('start' | 'center' | 'end')[]

const ALL: Lines = ['start', 'center', 'end']

/**
 * Snaps a moving box's edges and center to the edges and centers of
 * `others`, within `threshold` canvas pixels, each axis apart. The box keeps
 * its size. Pass `SNAP_DISTANCE / zoom` as the threshold so the pull feels
 * the same at every zoom.
 */
export function snapMove(
  box: Box,
  others: readonly Box[],
  threshold: number,
): Snap {
  const x = nearest(box, others, 'x', ALL, threshold)
  const y = nearest(box, others, 'y', ALL, threshold)
  // A center meeting a center can land on a half pixel, and layout holds integers.
  const snapped = {
    ...box,
    x: Math.round(box.x + (x?.delta ?? 0)),
    y: Math.round(box.y + (y?.delta ?? 0)),
  }
  return finish(snapped, x, y)
}

/**
 * Snaps only the edges a resize moves, `x` and `y` naming the moving edge
 * on each axis, and changes the size rather than the position to meet them.
 */
export function snapResize(
  box: Box,
  moving: { x: 'start' | 'end'; y: 'start' | 'end' },
  others: readonly Box[],
  threshold: number,
): Snap {
  const x = nearest(box, others, 'x', [moving.x], threshold)
  const y = nearest(box, others, 'y', [moving.y], threshold)
  const snapped = { ...box }
  const dx = Math.round(x?.delta ?? 0)
  const dy = Math.round(y?.delta ?? 0)
  if (moving.x === 'start') {
    snapped.x += dx
    snapped.width -= dx
  } else {
    snapped.width += dx
  }
  if (moving.y === 'start') {
    snapped.y += dy
    snapped.height -= dy
  } else {
    snapped.height += dy
  }
  if (snapped.width < 1 || snapped.height < 1) {
    return { box, guides: [], gaps: [] }
  }
  return finish(snapped, x, y)
}

interface Match {
  delta: number
  /** The coordinate both lines share once snapped. */
  at: number
  /** Every other box carrying a line at `at`. */
  targets: Box[]
}

function nearest(
  box: Box,
  others: readonly Box[],
  axis: 'x' | 'y',
  lines: Lines,
  threshold: number,
): Match | null {
  let best: Match | null = null
  for (const own of lines.map((line) => lineOf(box, axis, line))) {
    for (const other of others) {
      for (const theirs of ALL.map((line) => lineOf(other, axis, line))) {
        const delta = theirs - own
        if (Math.abs(delta) > threshold) continue
        if (best && Math.abs(delta) > Math.abs(best.delta)) continue
        if (best && delta === best.delta && theirs === best.at) {
          if (!best.targets.includes(other)) best.targets.push(other)
          continue
        }
        best = { delta, at: theirs, targets: [other] }
      }
    }
  }
  return best
}

function lineOf(box: Box, axis: 'x' | 'y', line: Lines[number]): number {
  const start = axis === 'x' ? box.x : box.y
  const size = axis === 'x' ? box.width : box.height
  if (line === 'start') return start
  if (line === 'end') return start + size
  return start + size / 2
}

/** The guides through each matched line and the gap to the nearest frame lined up on the other axis. */
function finish(box: Box, x: Match | null, y: Match | null): Snap {
  const guides: Guide[] = []
  if (x) {
    const all = [box, ...x.targets]
    guides.push({
      axis: 'x',
      at: x.at,
      from: Math.min(...all.map((b) => b.y)),
      to: Math.max(...all.map((b) => b.y + b.height)),
    })
  }
  if (y) {
    const all = [box, ...y.targets]
    guides.push({
      axis: 'y',
      at: y.at,
      from: Math.min(...all.map((b) => b.x)),
      to: Math.max(...all.map((b) => b.x + b.width)),
    })
  }
  const gaps: Gap[] = []
  const across = y ? gapAcross(box, y.targets, 'x') : null
  if (across) gaps.push(across)
  const down = x ? gapAcross(box, x.targets, 'y') : null
  if (down) gaps.push(down)
  return { box, guides, gaps }
}

/** The shortest clear run along `axis` from the box to one of the frames it lined up with. */
function gapAcross(box: Box, targets: Box[], axis: 'x' | 'y'): Gap | null {
  let best: Gap | null = null
  const start = (b: Box) => (axis === 'x' ? b.x : b.y)
  const end = (b: Box) => start(b) + (axis === 'x' ? b.width : b.height)
  const middle = axis === 'x' ? box.y + box.height / 2 : box.x + box.width / 2
  for (const target of targets) {
    const span =
      end(target) <= start(box)
        ? { from: end(target), to: start(box) }
        : end(box) <= start(target)
          ? { from: end(box), to: start(target) }
          : null
    if (!span || span.to - span.from <= 0) continue
    if (best && best.to - best.from <= span.to - span.from) continue
    best = { axis, at: middle, ...span }
  }
  return best
}
