import { describe, expect, it } from 'vitest'

import { isNotch, panEase, wheelPixels, wheelZoom } from './wheel'

const PIXEL = WheelEvent.DOM_DELTA_PIXEL
const LINE = WheelEvent.DOM_DELTA_LINE

describe('isNotch', () => {
  it.each([50, -50, 100, -120])(
    'reads a pixel delta of %i as a notch',
    (delta) => {
      expect(isNotch(delta, PIXEL)).toBe(true)
    },
  )

  it.each([1, -12, 49, -49])(
    'reads a pixel delta of %i as a trackpad',
    (delta) => {
      expect(isNotch(delta, PIXEL)).toBe(false)
    },
  )

  it('reads any line-mode delta as a notch', () => {
    expect(isNotch(1, LINE)).toBe(true)
  })

  it('reads a still axis as no notch, in either mode', () => {
    expect(isNotch(0, LINE)).toBe(false)
  })
})

describe('wheelPixels', () => {
  it('keeps a pixel delta as it is', () => {
    expect(wheelPixels(-37, PIXEL)).toBe(-37)
  })

  it('reads a line as 16 pixels', () => {
    expect(wheelPixels(-3, LINE)).toBe(-48)
  })
})

describe('wheelZoom', () => {
  it('steps one notch in for a notch up, whatever its size', () => {
    expect(wheelZoom(-300, PIXEL)).toBeCloseTo(1.2)
  })

  it('steps one notch out for a line-mode notch down', () => {
    expect(wheelZoom(3, LINE)).toBeCloseTo(1 / 1.2)
  })

  it('follows the curve for a small pinch delta', () => {
    expect(wheelZoom(-10, PIXEL)).toBeCloseTo(2 ** 0.1)
  })
})

describe('panEase', () => {
  it('starts at none of the distance and ends at all of it', () => {
    expect([panEase(0), panEase(1)]).toEqual([0, 1])
  })

  it('covers more than a linear share early', () => {
    expect(panEase(0.25)).toBeGreaterThan(0.25)
  })

  it('never moves backward across the ease', () => {
    const shares = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1].map(panEase)

    expect(shares).toEqual([...shares].sort((a, b) => a - b))
  })
})
