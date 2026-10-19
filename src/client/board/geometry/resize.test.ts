import { describe, expect, it } from 'vitest'

import { resizeBox, scaleBoxes } from './resize'

describe('scaleBoxes', () => {
  it('keeps each box its share of the bounds', () => {
    const scaled = scaleBoxes(
      {
        a: { x: 0, y: 0, width: 100, height: 100 },
        b: { x: 200, y: 0, width: 200, height: 100 },
      },
      { x: 0, y: 0, width: 400, height: 100 },
      { x: 0, y: 0, width: 200, height: 200 },
    )

    expect(scaled).toEqual({
      a: { x: 0, y: 0, width: 50, height: 200 },
      b: { x: 100, y: 0, width: 100, height: 200 },
    })
  })

  it('never shrinks a box under 1 px', () => {
    const scaled = scaleBoxes(
      { a: { x: 0, y: 0, width: 1, height: 1 } },
      { x: 0, y: 0, width: 400, height: 400 },
      { x: 0, y: 0, width: 4, height: 4 },
    )

    expect(scaled.a).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

const START = { x: 100, y: 100, width: 200, height: 100 }

describe('resizeBox', () => {
  it('grows from the southeast corner and keeps the position', () => {
    expect(resizeBox(START, 'se', 50, 20)).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 120,
    })
  })

  it('pins the southeast corner while the northwest one moves', () => {
    expect(resizeBox(START, 'nw', 30, -40)).toEqual({
      x: 130,
      y: 60,
      width: 170,
      height: 140,
    })
  })

  it('pins the southwest corner while the northeast one moves', () => {
    expect(resizeBox(START, 'ne', -50, 10)).toEqual({
      x: 100,
      y: 110,
      width: 150,
      height: 90,
    })
  })

  it('stops the west edge 1 px short of the east one', () => {
    expect(resizeBox(START, 'sw', 500, 0)).toEqual({
      x: 299,
      y: 100,
      width: 1,
      height: 100,
    })
  })

  it('stops the south edge at 1 px tall', () => {
    expect(resizeBox(START, 'se', 0, -400).height).toBe(1)
  })

  it('rounds a fractional drag to whole pixels', () => {
    expect(resizeBox(START, 'se', 10.6, 0.4)).toEqual({
      x: 100,
      y: 100,
      width: 211,
      height: 100,
    })
  })
})
