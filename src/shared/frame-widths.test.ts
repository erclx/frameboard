import { describe, expect, it } from 'vitest'

import {
  drawnExtent,
  linkedBar,
  linkedBoxes,
  viewDevice,
  widthsOf,
  xPast,
} from './frame-widths'

const frame = { x: 100, y: 40, width: 1440, height: 900 }
const phone = { x: 100, y: 40, width: 390, height: 844 }
const TABLET_AND_LAPTOP = [
  { width: 834, height: 1194 },
  { width: 1440, height: 900 },
]

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

  it('stands a phone frame, its tablet, and its laptop 80 apart by their bodies', () => {
    expect(
      linkedBoxes(phone, TABLET_AND_LAPTOP, {
        device: 'phone',
        showDevice: true,
      }),
    ).toEqual([
      { x: 628, y: 40, width: 834, height: 1194 },
      { x: 1689, y: 40, width: 1440, height: 900 },
    ])
  })

  it('starts the row past a laptop base reaching beyond the lid', () => {
    expect(
      linkedBoxes(frame, [{ width: 834, height: 1194 }], {
        device: 'laptop',
        showDevice: true,
      }),
    ).toEqual([{ x: 1767, y: 40, width: 834, height: 1194 }])
  })

  it('spaces a width under 320 as a bare box, since no device fits it', () => {
    expect(
      linkedBoxes(phone, [{ width: 300, height: 500 }], {
        device: 'phone',
        showDevice: true,
      }),
    ).toEqual([{ x: 590, y: 40, width: 300, height: 500 }])
  })

  it('gives a frame too narrow for a device the bodies its wider widths name', () => {
    const narrow = { x: 0, y: 0, width: 300, height: 500 }

    expect(
      linkedBoxes(narrow, [{ width: 834, height: 1194 }], {
        showDevice: true,
      }),
    ).toEqual([{ x: 418, y: 0, width: 834, height: 1194 }])
  })
})

describe('viewDevice', () => {
  const shown = { box: phone, device: 'phone', showDevice: true } as const

  it.each([
    [390, 'phone'],
    [834, 'tablet'],
    [1440, 'laptop'],
    [320, 'phone'],
    [300, null],
  ] as const)(
    'draws the %i view of a shown phone frame in %s',
    (width, device) => {
      expect(viewDevice(shown, width).device).toBe(device)
    },
  )

  it('draws every view bare with the device off', () => {
    const off = { box: phone }

    expect(viewDevice(off, 390).device).toBeNull()
    expect(viewDevice(off, 834).device).toBeNull()
  })

  it('turns the own view alone, since a linked one stands upright', () => {
    const turned = { ...shown, turn: 'left' } as const

    expect(viewDevice(turned, 390).turn).toBe('left')
    expect(viewDevice(turned, 320).turn).toBeUndefined()
  })
})

describe('linkedBar', () => {
  it.each([
    ['a phone, its status bar', 390, true, 54],
    ['a tablet, none', 834, true, 0],
    ['a phone with the device off, none', 390, false, 0],
  ] as const)('takes off %s', (_label, width, showDevice, bar) => {
    expect(linkedBar({ showDevice }, width)).toBe(bar)
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

  it('holds the body of every width it draws one around', () => {
    expect(
      drawnExtent(phone, TABLET_AND_LAPTOP, {
        device: 'phone',
        showDevice: true,
      }),
    ).toEqual({ x: 80, y: 2, width: 3158, height: 1270 })
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
