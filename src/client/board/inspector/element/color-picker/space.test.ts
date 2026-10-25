import { describe, expect, it } from 'vitest'

import {
  hslToRgb,
  hsvToRgb,
  parseComputed,
  parseHex,
  rgbToHsl,
  rgbToHsv,
  toHex,
} from './space'

const INDIGO = { r: 79, g: 70, b: 229, a: 1 }

describe('parseHex', () => {
  it.each([
    ['#4f46e5', INDIGO],
    ['4F46E5', INDIGO],
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#4f46e580', { ...INDIGO, a: 0.502 }],
    ['#0008', { r: 0, g: 0, b: 0, a: 0.533 }],
  ])('reads %s', (text, color) => {
    expect(parseHex(text)).toEqual(color)
  })

  it.each(['', '#12', '#12345', 'red', '#ggg'])('refuses %j', (text) => {
    expect(parseHex(text)).toBeNull()
  })
})

describe('toHex', () => {
  it('writes six uppercase digits, rounding and holding each channel in range', () => {
    expect(toHex({ r: 78.6, g: -4, b: 300, a: 0.5 })).toBe('4F00FF')
  })
})

describe('parseComputed', () => {
  it.each([
    ['rgb(79, 70, 229)', INDIGO],
    ['rgba(79, 70, 229, 0.5)', { ...INDIGO, a: 0.5 }],
    ['rgb(79 70 229 / 0.25)', { ...INDIGO, a: 0.25 }],
    ['color(srgb 1 0 0 / 0.5)', { r: 255, g: 0, b: 0, a: 0.5 }],
    ['#4F46E5', INDIGO],
  ])('reads %s', (text, color) => {
    expect(parseComputed(text)).toEqual(color)
  })

  it.each(['currentcolor', 'rgb(1, 2)', 'color(display-p3 1 0 0)'])(
    'refuses %s',
    (text) => {
      expect(parseComputed(text)).toBeNull()
    },
  )
})

describe('HSV', () => {
  it('reads indigo', () => {
    const { h, s, v } = rgbToHsv(INDIGO)
    expect([Math.round(h), Math.round(s * 100), Math.round(v * 100)]).toEqual([
      243, 69, 90,
    ])
  })

  it('reads a grey with no hue or saturation', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128, a: 1 })).toMatchObject({
      h: 0,
      s: 0,
    })
  })

  it.each([
    '4F46E5',
    'FF0000',
    '00FF00',
    '0000FF',
    '000000',
    'FFFFFF',
    'F59E0B',
  ])('round trips %s', (hex) => {
    const color = parseHex(hex)
    if (!color) throw new Error(`no color for ${hex}`)
    expect(toHex(hsvToRgb(rgbToHsv(color)))).toBe(hex)
  })
})

describe('HSL', () => {
  it('reads indigo', () => {
    const { h, s, l } = rgbToHsl(INDIGO)
    expect([Math.round(h), Math.round(s), Math.round(l)]).toEqual([243, 75, 59])
  })

  it.each(['4F46E5', 'FF0000', '0EA5E9', '000000', 'FFFFFF', '808080'])(
    'round trips %s',
    (hex) => {
      const color = parseHex(hex)
      if (!color) throw new Error(`no color for ${hex}`)
      expect(toHex(hslToRgb(rgbToHsl(color)))).toBe(hex)
    },
  )
})
