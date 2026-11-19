import { describe, expect, it } from 'vitest'

import { presentScale } from './fit'

const room = { width: 1280, height: 800 }

describe('presentScale', () => {
  it('fits a page-tall phone frame as one screen, as a 844 tall phone fits', () => {
    const phone = {
      box: { width: 390, height: 2328 },
      device: 'phone' as const,
      scroll: false,
    }
    expect(presentScale(phone, room)).toBeCloseTo(800 / 972)
  })

  it('fits a page-tall frame wearing no device by its whole box', () => {
    const bare = { box: { width: 390, height: 2328 }, device: null }
    expect(presentScale(bare, room)).toBeCloseTo(800 / 2328)
  })
})
