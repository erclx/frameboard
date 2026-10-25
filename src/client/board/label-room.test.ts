import { describe, expect, it } from 'vitest'

import { labelRoom } from './label-room'

const at = (ref: string, x: number, y: number, width = 100, height = 100) => ({
  ref,
  box: { x, y, width, height },
})

describe('labelRoom', () => {
  it('measures the gap up to a frame stacked above', () => {
    const rooms = labelRoom([at('top', 0, 0), at('below', 0, 180)])

    expect(rooms.get('below')).toBe(80)
  })

  it('takes the nearest of several frames above', () => {
    const rooms = labelRoom([
      at('far', 0, 0),
      at('near', 50, 150),
      at('below', 0, 300),
    ])

    expect(rooms.get('below')).toBe(50)
  })

  it('counts a frame above that overlaps across in part', () => {
    const rooms = labelRoom([at('offset', 90, 0), at('below', 0, 140)])

    expect(rooms.get('below')).toBe(40)
  })

  it('leaves a frame beside the column out', () => {
    const rooms = labelRoom([at('beside', 120, 0), at('below', 0, 140)])

    expect(rooms.get('below')).toBe(Infinity)
  })

  it('gives a lone frame unbounded room', () => {
    expect(labelRoom([at('lone', 0, 0)]).get('lone')).toBe(Infinity)
  })

  it('gives no room under a frame overlapping its top', () => {
    const rooms = labelRoom([at('over', 0, 0), at('under', 20, 60)])

    expect(rooms.get('under')).toBe(0)
  })
})
