import { describe, expect, it } from 'vitest'

import {
  bezelBox,
  bezelReach,
  deviceForWidth,
  DEVICES,
  foldBand,
  islandCenter,
  islandOf,
  laptopParts,
  nearestPose,
  pageBox,
  PHONE_ISLAND,
  phoneIsland,
  POSE_SIZES,
  poseOf,
  screenCorners,
  shownBox,
  STATUS_BAR,
  topInset,
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
  it('grows a phone frame by 16 points above and below and by its buttons aside', () => {
    expect(bezelBox(frame, 'phone')).toEqual({
      x: 80,
      y: 24,
      width: 430,
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

  it('grows a foldable frame by 20 points on every side', () => {
    const open = { x: 0, y: 0, width: 890, height: 626 }
    expect(bezelBox(open, 'foldable')).toEqual({
      x: -20,
      y: -20,
      width: 930,
      height: 666,
    })
  })

  it('keeps the box with no device', () => {
    expect(bezelBox(frame, null)).toEqual(frame)
  })
})

describe('bezelReach', () => {
  it('reaches a phone frame by its drop shadow, past the body on every side', () => {
    expect(bezelReach(frame, 'phone')).toEqual({
      x: 52,
      y: 8,
      width: 486,
      height: 940,
    })
  })

  it('reaches a laptop frame by its base aside and by its shadow above and below', () => {
    const desktop = { x: 0, y: 0, width: 1440, height: 900 }
    expect(bezelReach(desktop, 'laptop')).toEqual({
      x: -110,
      y: -40,
      width: 1660,
      height: 1020,
    })
  })

  it('reaches an open foldable frame by its drop shadow', () => {
    const open = { x: 0, y: 0, width: 890, height: 626 }
    expect(bezelReach(open, 'foldable')).toEqual({
      x: -60,
      y: -40,
      width: 1010,
      height: 746,
    })
  })

  it.each(DEVICES)('holds the whole %s body and its edge', (device) => {
    const body = bezelBox(frame, device)
    const reach = bezelReach(frame, device)
    expect(reach.x).toBeLessThan(body.x)
    expect(reach.y).toBeLessThan(body.y)
    expect(reach.x + reach.width).toBeGreaterThan(body.x + body.width)
    expect(reach.y + reach.height).toBeGreaterThan(body.y + body.height)
  })

  it('keeps the box with no device', () => {
    expect(bezelReach(frame, null)).toEqual(frame)
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

describe('the phone body', () => {
  it('draws the wide island wider than the compact one at the same height and place', () => {
    const compact = phoneIsland('compact')
    const wide = phoneIsland('wide')
    expect(wide.width).toBeGreaterThan(compact.width)
    expect(wide.height).toBe(compact.height)
    expect(wide.top).toBe(compact.top)
  })

  it.each([
    ['wide', 'wide'],
    ['compact', 'compact'],
    [undefined, 'compact'],
    ['huge', 'compact'],
    [true, 'compact'],
  ] as const)('reads an island key of %s as %s', (value, island) => {
    expect(islandOf(value)).toBe(island)
  })
})

describe('pageBox', () => {
  const phone = { x: 100, y: 40, width: 466, height: 678 }

  it('starts a phone page 54 down its box, 10 past the island, a 624 tall page in a 678 box', () => {
    expect(STATUS_BAR.height).toBe(54)
    expect(STATUS_BAR.height - (PHONE_ISLAND.top + PHONE_ISLAND.height)).toBe(
      10,
    )
    expect(pageBox(phone, 'phone')).toEqual({
      x: 100,
      y: 94,
      width: 466,
      height: 624,
    })
  })

  it.each([null, undefined, 'tablet', 'laptop', 'foldable'] as const)(
    'keeps the box as the page with %s',
    (device) => {
      expect(pageBox(phone, device)).toEqual(phone)
      expect(topInset(device)).toBe(0)
    },
  )

  it('leaves no page in a phone box shorter than the status bar', () => {
    expect(pageBox({ ...phone, height: 40 }, 'phone').height).toBe(0)
  })
})

describe('screenCorners', () => {
  it.each([
    ['phone', '62px'],
    ['tablet', '18px'],
    ['laptop', '10px 10px 0 0'],
    ['foldable', '48px'],
  ] as const)('rounds a %s screen to %s', (device, corners) => {
    expect(screenCorners(device)).toBe(corners)
  })
})

describe('a foldable pose', () => {
  it.each([
    ['closed', 466, 678],
    ['half', 890, 626],
    ['open', 890, 626],
  ] as const)('sizes the %s screen %i by %i', (pose, width, height) => {
    expect(POSE_SIZES[pose]).toEqual({ width, height })
  })

  it.each([
    ['open', 'open'],
    ['half', 'half'],
    ['closed', 'closed'],
    ['tent', 'closed'],
    [undefined, 'closed'],
    [2, 'closed'],
  ] as const)('reads a stored %s as %s', (stored, pose) => {
    expect(poseOf(stored)).toBe(pose)
  })

  it.each([
    [390, 'closed'],
    [466, 'closed'],
    [678, 'closed'],
    [679, 'open'],
    [1440, 'open'],
  ] as const)('starts a %i wide frame %s', (width, pose) => {
    expect(nearestPose(width)).toBe(pose)
  })

  it('never picks a width-named device at a pose width', () => {
    expect(deviceForWidth(POSE_SIZES.open.width)).not.toBe('foldable')
  })

  it.each([
    ['closed', 0.5],
    ['half', 0.75],
    ['open', 0.75],
  ] as const)('centers the %s island at %f of the screen', (pose, center) => {
    expect(islandCenter(pose)).toBe(center)
  })

  it('draws no fold on the cover screen', () => {
    expect(foldBand('closed')).toBeNull()
  })

  it('shades the half open fold wider than the open crease', () => {
    expect(foldBand('half')?.width).toBeGreaterThan(
      foldBand('open')?.width ?? 0,
    )
  })
})

describe('shownBox', () => {
  const at = (height: number) => ({ x: 100, y: 40, width: 390, height })

  it('shows a page-tall phone frame one screen tall', () => {
    expect(shownBox({ box: at(2328), device: 'phone', scroll: false })).toEqual(
      { x: 100, y: 40, width: 390, height: 844 },
    )
  })

  it('shows a phone frame shorter than a screen at its stored box', () => {
    expect(shownBox({ box: at(600), device: 'phone', scroll: false })).toEqual(
      at(600),
    )
  })

  it('shows a phone scroll frame at its stored box, which is already its screen', () => {
    expect(shownBox({ box: at(1200), device: 'phone', scroll: true })).toEqual(
      at(1200),
    )
  })

  it('shows a foldable at its stored box, which its pose sizes', () => {
    const box = { x: 0, y: 0, width: 466, height: 2000 }
    expect(shownBox({ box, device: 'foldable', scroll: false })).toEqual(box)
  })

  it('shows a page-tall tablet frame at its stored box', () => {
    const box = { x: 0, y: 0, width: 834, height: 3000 }
    expect(shownBox({ box, device: 'tablet', scroll: false })).toEqual(box)
  })

  it('shows a phone-wide frame wearing no device at its stored box', () => {
    expect(shownBox({ box: at(2328), scroll: false })).toEqual(at(2328))
  })
})
