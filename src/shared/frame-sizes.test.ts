import { describe, expect, it } from 'vitest'

import {
  FRAME_SIZE_NAMES,
  frameSizeOf,
  namedWidth,
  presetAt,
  previewWidth,
  referenceHeight,
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

describe('referenceHeight', () => {
  it.each([
    [390, 844],
    [393, 844],
    [834, 1194],
    [1280, 900],
    [3840, 900],
    [300, 900],
  ])('reads %i wide as %i tall', (width, height) => {
    expect(referenceHeight(width)).toBe(height)
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

describe('video sizes', () => {
  it.each([
    ['video-landscape', 1920, 1080],
    ['video-portrait', 1080, 1920],
  ] as const)('names %s at %i x %i', (name, width, height) => {
    expect(FRAME_SIZE_NAMES).toContain(name)
    expect(frameSizeOf(name)).toEqual({ width, height })
  })
})

describe('namedWidth', () => {
  it.each([
    ['overview-390', 390],
    ['overview-834', 834],
    ['overview-1440', 1440],
    ['overview-744', 744],
    ['overview-2-390', 390],
  ])('reads a known width off %s', (name, width) => {
    expect(namedWidth(name)).toBe(width)
  })

  it.each([
    ['a number no size names', 'overview-1100'],
    ['a duplicate suffix', 'overview-2'],
    ['a duplicate of a suffixed name', 'overview-390-2'],
    ['a year', 'hero-2024'],
    ['a ratio', 'ratio-16-9'],
    ['a height', 'overview-844'],
    ['a padded number', 'overview-0390'],
    ['digits with no hyphen', 'overview390'],
    ['a width alone', '390'],
    ['no suffix', 'overview'],
  ])('reads nothing off %s', (_label, name) => {
    expect(namedWidth(name)).toBeUndefined()
  })
})
