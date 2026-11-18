interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The devices the board can draw around a frame, the frame's width picking one. */
export const DEVICES = ['phone', 'tablet', 'laptop'] as const

export type Device = (typeof DEVICES)[number]

/** A device's body around the screen, in points, which a frame's box reads as. */
export interface Bezel {
  /** The body's width past the screen on its top and sides, which chrome beside the frame stands past. */
  border: number
  /** The body's height below the screen, the border but for a laptop's chin and base. */
  bottom: number
  /** The screen's corner radius, which clips the frame. */
  screenRadius: number
  /** The body's outer corner radius, the screen's plus the border. */
  bodyRadius: number
}

/** The laptop lid's chin below the screen, past the border its sides hold. */
const LAPTOP_CHIN = 28

/** The laptop's base below the chin, reaching past the lid on each side by its share of the lid's width. */
export const LAPTOP_BASE = { height: 14, reach: 0.06, radius: 10 } as const

/**
 * Bezels measured off a current Pro phone and 13-inch tablet, the tablet's
 * screen radius a guess, and the laptop scaled off the picked mock.
 */
export const BEZELS = {
  phone: { border: 16, bottom: 16, screenRadius: 62, bodyRadius: 78 },
  tablet: { border: 44, bottom: 44, screenRadius: 18, bodyRadius: 62 },
  laptop: {
    border: 20,
    bottom: LAPTOP_CHIN + LAPTOP_BASE.height,
    screenRadius: 10,
    bodyRadius: 30,
  },
} as const satisfies Record<Device, Bezel>

/**
 * The narrowest width each device draws around, widest first, so a frame
 * takes the first one it reaches. Under the phone's width no device fits.
 */
const DEVICE_WIDTHS = [
  ['laptop', 1024],
  ['tablet', 480],
  ['phone', 320],
] as const satisfies readonly (readonly [Device, number])[]

/** The device a frame this wide draws inside, null under 320 where none fits. */
export function deviceForWidth(width: number): Device | null {
  return DEVICE_WIDTHS.find(([, least]) => width >= least)?.[0] ?? null
}

/**
 * The body's colors, fixed in both themes, since the board draws hardware
 * rather than chrome: the body, the hairline around it, and the island.
 */
export const BEZEL_COLORS = {
  body: '#17181b',
  base: '#2c2e33',
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

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The laptop's chin and base, each a box from the frame's top left, which
 * the board and the PNG draw as positioned boxes, since one spread around
 * the screen cannot draw a body wider below than above.
 */
export function laptopParts({
  width,
  height,
}: {
  width: number
  height: number
}): {
  chin: Rect
  base: Rect
} {
  const { border } = BEZELS.laptop
  const lid = width + 2 * border
  const reach = baseReach(width)
  return {
    chin: { x: -border, y: height, width: lid, height: LAPTOP_CHIN },
    base: {
      x: -border - reach,
      y: height + LAPTOP_CHIN,
      width: lid + 2 * reach,
      height: LAPTOP_BASE.height,
    },
  }
}

function baseReach(width: number): number {
  return Math.round((width + 2 * BEZELS.laptop.border) * LAPTOP_BASE.reach)
}

/**
 * The `box-shadow` drawing a device's body, with a hairline on the board so a
 * dark body reads on a dark canvas, and no drop shadow in an export.
 */
export function bezelShadow(
  device: Device,
  { board = true }: { board?: boolean } = {},
): string {
  const { border } = BEZELS[device]
  if (!board) {
    return [
      `0 0 0 ${border - 1}px ${BEZEL_COLORS.body}`,
      `0 0 0 ${border}px ${BEZEL_COLORS.edge}`,
    ].join(', ')
  }
  return [
    `0 0 0 ${border}px ${BEZEL_COLORS.body}`,
    `0 0 0 calc(${border}px + 1px / var(--zoom, 1)) ${BEZEL_COLORS.edge}`,
    `0 ${border}px ${border * 3}px rgba(0, 0, 0, 0.3)`,
  ].join(', ')
}

/**
 * The box a device's body covers around a frame's box, the box itself with
 * none. A laptop's base reaches past its lid, so its sides grow by more
 * than its top.
 */
export function bezelBox(box: Box, device: Device | null | undefined): Box {
  if (!device) return { ...box }
  const { border, bottom } = BEZELS[device]
  const side = device === 'laptop' ? border + baseReach(box.width) : border
  return {
    x: box.x - side,
    y: box.y - border,
    width: box.width + 2 * side,
    height: box.height + border + bottom,
  }
}
