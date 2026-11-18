import { describe, expect, it } from 'vitest'

import {
  bezelBox,
  deviceForWidth,
  laptopParts,
  screenCorners,
} from './frame-device'
import { drawnExtent } from './frame-widths'

const frame = { x: 100, y: 40, width: 390, height: 844 }

describe('deviceForWidth', () => {
  it.each([
    [319, null],
    [320, 'phone'],
    [479, 'phone'],
    [480, 'tablet'],
    [1023, 'tablet'],
    [1024, 'laptop'],
    [1440, 'laptop'],
  ] as const)('draws a %i wide frame in %s', (width, device) => {
    expect(deviceForWidth(width)).toBe(device)
  })
})

describe('bezelBox', () => {
  it('grows a phone frame by 16 points on every side', () => {
    expect(bezelBox(frame, 'phone')).toEqual({
      x: 84,
      y: 24,
      width: 422,
      height: 876,
    })
  })

  it('grows a tablet frame by 44 points on every side', () => {
    expect(bezelBox(frame, 'tablet')).toEqual({
      x: 56,
      y: -4,
      width: 478,
      height: 932,
    })
  })

  it('grows a laptop frame by its lid above, and its chin, base, and the base reach below and aside', () => {
    const desktop = { x: 0, y: 0, width: 1440, height: 900 }
    expect(bezelBox(desktop, 'laptop')).toEqual({
      x: -109,
      y: -20,
      width: 1658,
      height: 962,
    })
  })

  it('keeps the box with no device', () => {
    expect(bezelBox(frame, null)).toEqual(frame)
  })
})

describe('laptopParts', () => {
  it('sets the chin under the screen as wide as the lid and the base past it on both sides', () => {
    expect(laptopParts({ width: 1440, height: 900 })).toEqual({
      chin: { x: -20, y: 900, width: 1480, height: 28 },
      base: { x: -109, y: 928, width: 1658, height: 14 },
    })
  })
})

describe('drawnExtent with a device', () => {
  it('holds the bezel, so a frame placed past it lands clear', () => {
    const extent = drawnExtent(frame, [], 'phone')
    expect(extent).toEqual(bezelBox(frame, 'phone'))
  })

  it('holds the laptop base reaching past the lid', () => {
    const desktop = { x: 0, y: 0, width: 1440, height: 900 }
    expect(drawnExtent(desktop, [], 'laptop')).toEqual(
      bezelBox(desktop, 'laptop'),
    )
  })

  it('holds the bezel around the frame and the linked widths past it', () => {
    const extent = drawnExtent(frame, [{ width: 834, height: 1194 }], 'tablet')
    expect(extent).toEqual({
      x: 56,
      y: -4,
      width: 390 + 80 + 834 + 44,
      height: 1194 + 44,
    })
  })
})

describe('screenCorners', () => {
  it.each([
    ['phone', '62px'],
    ['tablet', '18px'],
    ['laptop', '10px 10px 0 0'],
  ] as const)('rounds a %s screen to %s', (device, corners) => {
    expect(screenCorners(device)).toBe(corners)
  })
})
