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
})
