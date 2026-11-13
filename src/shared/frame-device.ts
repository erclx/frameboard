interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The devices the board can draw around a frame. */
export const DEVICES = ['phone', 'tablet'] as const

export type Device = (typeof DEVICES)[number]

/** A device's body around the screen, in points, which a frame's box reads as. */
export interface Bezel {
  /** The body's width past the screen on every side. */
  border: number
  /** The screen's corner radius, which clips the frame. */
  screenRadius: number
  /** The body's outer corner radius, the screen's plus the border. */
  bodyRadius: number
}

/**
 * The phone's border is a current Pro's body less its display, 71.9 mm
 * across holding 1206 pixels at 460 ppi, which is 16 points a side. The
 * tablet's is a 13-inch Pro's, 215.5 mm across holding 2064 pixels at 264
 * ppi, which is 44. The tablet's screen radius is a guess no source backs.
 */
export const BEZELS = {
  phone: { border: 16, screenRadius: 62, bodyRadius: 78 },
  tablet: { border: 44, screenRadius: 18, bodyRadius: 62 },
} as const satisfies Record<Device, Bezel>

/**
 * The body's colors, fixed in both themes, since the board draws hardware
 * rather than chrome: the body, the hairline around it, and the island.
 */
export const BEZEL_COLORS = {
  body: '#17181b',
  edge: '#45484f',
  island: '#050506',
  homeBar: 'rgba(128, 128, 128, 0.6)',
} as const

/**
 * The phone's island, a generic pill standing in for a size no source gives,
 * and the home bar, each centered on the screen and drawn over the frame.
 */
export const PHONE_ISLAND = { width: 81, height: 30, top: 14 } as const
export const HOME_BAR = { width: 140, height: 5, bottom: 8 } as const

/**
 * The CSS `box-shadow` drawing a device's body: a spread the border wide
 * around a box rounded to the screen radius, which also covers the frame's
 * corners past that radius, so the body's outer radius is the screen's plus
 * the border, its last pixel a hairline edge. The export leaves out the drop
 * shadow, which would fall past the PNG's edge.
 */
export function bezelShadow(
  device: Device,
  { drop = true }: { drop?: boolean } = {},
): string {
  const { border } = BEZELS[device]
  return [
    `0 0 0 ${border - 1}px ${BEZEL_COLORS.body}`,
    `0 0 0 ${border}px ${BEZEL_COLORS.edge}`,
    ...(drop ? [`0 ${border}px ${border * 3}px rgba(0, 0, 0, 0.3)`] : []),
  ].join(', ')
}

/**
 * A layout entry's `device` value, or null for anything but a known device,
 * so a value no reader understands reads as a frame with no device.
 */
export function deviceOf(value: unknown): Device | null {
  return DEVICES.find((device) => device === value) ?? null
}

/** The box a device's body covers around a frame's box, the box itself with none. */
export function bezelBox(box: Box, device: Device | null | undefined): Box {
  if (!device) return { ...box }
  const { border } = BEZELS[device]
  return {
    x: box.x - border,
    y: box.y - border,
    width: box.width + 2 * border,
    height: box.height + 2 * border,
  }
}
