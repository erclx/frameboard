import { describe, expect, it } from 'vitest'

import { bezelBox, deviceOf } from './frame-device'
import { drawnExtent } from './frame-widths'

const frame = { x: 100, y: 40, width: 390, height: 844 }

describe('deviceOf', () => {
  it.each(['phone', 'tablet'] as const)('reads %s as written', (device) => {
    expect(deviceOf(device)).toBe(device)
  })

  it.each([
    ['an unknown device', 'watch'],
    ['a capitalized device', 'Phone'],
    ['a number', 1],
    ['nothing', undefined],
  ])('reads %s as none', (_, value) => {
    expect(deviceOf(value)).toBeNull()
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

  it('keeps the box with no device', () => {
    expect(bezelBox(frame, null)).toEqual(frame)
  })
})

describe('drawnExtent with a device', () => {
  it('holds the bezel, so a frame placed past it lands clear', () => {
    const extent = drawnExtent(frame, [], 'phone')
    expect(extent).toEqual(bezelBox(frame, 'phone'))
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
