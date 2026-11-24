import { describe, expect, it } from 'vitest'

import { drawnExtent, linkedBoxes, widthsOf, xPast } from './frame-widths'

const frame = { x: 100, y: 40, width: 1440, height: 900 }

describe('widthsOf', () => {
  it('reads a list of width and height objects as written', () => {
    expect(
      widthsOf([
        { width: 834, height: 1194 },
        { width: 390, height: 844 },
      ]),
    ).toEqual([
      { width: 834, height: 1194 },
      { width: 390, height: 844 },
    ])
  })

  it.each([
    ['a string', '834,390'],
    ['a list of numbers', [834, 390]],
    ['an object missing height', [{ width: 834 }]],
    ['a zero width', [{ width: 0, height: 844 }]],
    ['a fractional height', [{ width: 390, height: 844.5 }]],
    [
      'a repeated width',
      [
        { width: 390, height: 844 },
        { width: 390, height: 900 },
      ],
    ],
    ['an object', { width: 390, height: 844 }],
    ['nothing', undefined],
  ])('reads %s as none', (_, value) => {
    expect(widthsOf(value)).toEqual([])
  })
})

describe('linkedBoxes', () => {
  it('places each width in a row 80 past the last, at the frame y', () => {
    expect(
      linkedBoxes(frame, [
        { width: 834, height: 1194 },
        { width: 390, height: 844 },
      ]),
    ).toEqual([
      { x: 1620, y: 40, width: 834, height: 1194 },
      { x: 2534, y: 40, width: 390, height: 844 },
    ])
  })

  it('starts the row past a laptop base reaching beyond the lid', () => {
    expect(
      linkedBoxes(frame, [{ width: 834, height: 1194 }], 'laptop'),
    ).toEqual([{ x: 1709, y: 40, width: 834, height: 1194 }])
  })

  it("keeps the row 80 past a phone frame's buttons", () => {
    const phone = { x: 100, y: 40, width: 390, height: 844 }

    expect(linkedBoxes(phone, [{ width: 320, height: 568 }], 'phone')).toEqual([
      { x: 574, y: 40, width: 320, height: 568 },
    ])
  })
})

describe('drawnExtent', () => {
  it('spans the frame and its row, as tall as the tallest box', () => {
    expect(
      drawnExtent(frame, [
        { width: 834, height: 1194 },
        { width: 390, height: 844 },
      ]),
    ).toEqual({ x: 100, y: 40, width: 2824, height: 1194 })
  })

  it('is the frame box when it lists no width', () => {
    expect(drawnExtent(frame, [])).toEqual(frame)
  })
})

describe('xPast', () => {
  it.each([
    ['a laptop, past its base', 1440, 'laptop', 1709],
    ['a tablet, past its border and buttons', 834, 'tablet', 1638],
    ['a phone, past its buttons', 390, 'phone', 1620],
    ['no device, at the frame', 1440, null, 1600],
  ] as const)('places %s 80 clear of the edge', (_, width, device, x) => {
    expect(xPast(1520, width, device)).toBe(x)
  })
})
