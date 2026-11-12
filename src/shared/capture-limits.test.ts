import { describe, expect, it } from 'vitest'

import {
  filmstripWidth,
  MAX_COMPOSITE_SIDE,
  maxFilmstripCount,
} from './capture-limits'

describe('maxFilmstripCount', () => {
  it.each([
    [1, 11],
    [2, 5],
    [3, 3],
  ])('fits a desktop frame at %ix to %i moments', (scale, count) => {
    expect(maxFilmstripCount(1440, scale)).toBe(count)
  })

  it('stops at the last count whose strip the screenshot surface holds', () => {
    const count = maxFilmstripCount(390, 2)

    expect(filmstripWidth(390, count) * 2).toBeLessThanOrEqual(
      MAX_COMPOSITE_SIDE,
    )
    expect(filmstripWidth(390, count + 1) * 2).toBeGreaterThan(
      MAX_COMPOSITE_SIDE,
    )
  })

  it('fits no strip of a frame wider than half the surface', () => {
    expect(maxFilmstripCount(9000, 1)).toBeLessThan(2)
  })
})
