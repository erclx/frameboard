import { describe, expect, it } from 'vitest'

import { snapMove, snapResize } from './snap'

const OTHER = { x: 0, y: 0, width: 400, height: 200 }

describe('snapMove', () => {
  it('pulls a left edge onto another frame’s right edge within the threshold', () => {
    const snap = snapMove(
      { x: 404, y: 300, width: 100, height: 100 },
      [OTHER],
      6,
    )

    expect(snap.box).toEqual({ x: 400, y: 300, width: 100, height: 100 })
    expect(snap.guides).toEqual([{ axis: 'x', at: 400, from: 0, to: 400 }])
  })

  it('leaves a box further than the threshold where it is', () => {
    const snap = snapMove(
      { x: 410, y: 300, width: 100, height: 100 },
      [OTHER],
      6,
    )

    expect(snap.box.x).toBe(410)
    expect(snap.guides).toEqual([])
  })

  it('pulls a center onto another frame’s center', () => {
    const snap = snapMove(
      { x: 600, y: 52, width: 100, height: 100 },
      [OTHER],
      6,
    )

    expect(snap.box.y).toBe(50)
    expect(snap.guides).toEqual([{ axis: 'y', at: 100, from: 0, to: 700 }])
  })

  it('takes the nearer of two lines in reach', () => {
    const snap = snapMove(
      { x: 406, y: 300, width: 100, height: 100 },
      [OTHER, { x: 410, y: 600, width: 50, height: 50 }],
      6,
    )

    expect(snap.box.x).toBe(410)
  })

  it('measures the gap to the frame it lined up with across the other axis', () => {
    const snap = snapMove({ x: 440, y: 3, width: 100, height: 100 }, [OTHER], 6)

    expect(snap.box.y).toBe(0)
    expect(snap.gaps).toEqual([{ axis: 'x', at: 50, from: 400, to: 440 }])
  })

  it('scales the reach with the threshold it is given', () => {
    const snap = snapMove(
      { x: 420, y: 300, width: 100, height: 100 },
      [OTHER],
      24,
    )

    expect(snap.box.x).toBe(400)
  })
})

describe('snapResize', () => {
  it('moves only the dragged edge to meet another frame', () => {
    const snap = snapResize(
      { x: 500, y: 0, width: 100, height: 197 },
      { x: 'end', y: 'end' },
      [OTHER],
      6,
    )

    expect(snap.box).toEqual({ x: 500, y: 0, width: 100, height: 200 })
  })

  it('keeps the far edge put when the near one snaps', () => {
    const snap = snapResize(
      { x: 404, y: 300, width: 100, height: 100 },
      { x: 'start', y: 'end' },
      [OTHER],
      6,
    )

    expect(snap.box).toEqual({ x: 400, y: 300, width: 104, height: 100 })
  })

  it('ignores an edge the resize does not move', () => {
    const snap = snapResize(
      { x: 404, y: 300, width: 100, height: 100 },
      { x: 'end', y: 'end' },
      [OTHER],
      6,
    )

    expect(snap.box.x).toBe(404)
  })
})
