import { describe, expect, it } from 'vitest'

import {
  FRAME_SIZE_NAMES,
  frameSizeOf,
  presetAt,
  previewWidth,
} from './frame-sizes'

describe('presetAt', () => {
  it.each([
    [319, undefined],
    [320, 'phone'],
    [393, 'phone'],
    [479, 'phone'],
    [480, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [3840, 'desktop'],
  ])('reads %i as %s', (width, preset) => {
    expect(presetAt(width)).toBe(preset)
  })
})

describe('previewWidth', () => {
  it('keeps a width inside the preset range', () => {
    expect(previewWidth('phone', 393)).toBe(393)
  })

  it('takes the preset default from a width outside its range', () => {
    expect(previewWidth('tablet', 1180)).toBe(834)
  })

  it('takes the phone default from a width below every range', () => {
    expect(previewWidth('phone', 300)).toBe(390)
  })
})

describe('social sizes', () => {
  it.each([
    ['og-card', 1200, 630],
    ['linkedin-post', 1200, 627],
  ] as const)('names %s at %i x %i', (name, width, height) => {
    expect(FRAME_SIZE_NAMES).toContain(name)
    expect(frameSizeOf(name)).toEqual({ width, height })
  })
})
