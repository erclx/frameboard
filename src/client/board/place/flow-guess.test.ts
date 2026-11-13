import { describe, expect, it } from 'vitest'

import { guessFlow } from './flow-guess'

describe('guessFlow', () => {
  it('reads two elements side by side as a row with their spacing as the gap', () => {
    const boxes = [
      { x: 10, y: 20, width: 40, height: 18 },
      { x: 98, y: 20, width: 50, height: 18 },
    ]

    expect(guessFlow(boxes)).toEqual({ direction: 'row', gap: 48 })
  })

  it('reads elements stacked one over another as a column', () => {
    const boxes = [
      { x: 10, y: 100, width: 40, height: 20 },
      { x: 12, y: 0, width: 60, height: 20 },
      { x: 10, y: 50, width: 40, height: 20 },
    ]

    expect(guessFlow(boxes)).toEqual({ direction: 'column', gap: 30 })
  })

  it('takes the mean of uneven spaces, rounded', () => {
    const boxes = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
      { x: 41, y: 0, width: 10, height: 10 },
    ]

    expect(guessFlow(boxes).gap).toBe(11)
  })

  it('reads overlapping neighbors as no space', () => {
    const boxes = [
      { x: 0, y: 0, width: 50, height: 10 },
      { x: 30, y: 0, width: 50, height: 10 },
    ]

    expect(guessFlow(boxes)).toEqual({ direction: 'row', gap: 0 })
  })

  it('gives one element no gap', () => {
    expect(guessFlow([{ x: 5, y: 5, width: 10, height: 10 }])).toEqual({
      direction: 'row',
      gap: 0,
    })
  })

  it('takes both neighbors’ margins out of the space between them', () => {
    const boxes = [
      { x: 0, y: 0, width: 40, height: 20 },
      { x: 100, y: 0, width: 40, height: 20 },
    ]
    const margins = [
      { top: 0, right: 12, bottom: 0, left: 5 },
      { top: 0, right: 7, bottom: 0, left: 8 },
    ]

    expect(guessFlow(boxes, margins)).toEqual({ direction: 'row', gap: 40 })
  })

  it('reads margins that collapsed in a column as no gap', () => {
    // A heading over a paragraph, 21 px apart where their 21 and 16 collapsed.
    const boxes = [
      { x: 0, y: 0, width: 200, height: 37 },
      { x: 0, y: 58, width: 200, height: 18 },
    ]
    const margins = [
      { top: 21, right: 0, bottom: 21, left: 0 },
      { top: 16, right: 0, bottom: 16, left: 0 },
    ]

    expect(guessFlow(boxes, margins)).toEqual({ direction: 'column', gap: 0 })
  })

  it('reads a box with no margins named as having none', () => {
    const boxes = [
      { x: 0, y: 0, width: 40, height: 20 },
      { x: 100, y: 0, width: 40, height: 20 },
    ]

    expect(
      guessFlow(boxes, [undefined, { top: 0, right: 0, bottom: 0, left: 10 }]),
    ).toEqual({ direction: 'row', gap: 50 })
  })
})
