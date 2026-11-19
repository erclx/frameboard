import { FRAME_SIZES, referenceHeight } from './frame-sizes'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The devices the board can draw around a frame. A frame's width picks the
 * first three, and a frame names a foldable.
 */
export const DEVICES = ['phone', 'tablet', 'laptop', 'foldable'] as const

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
 * Bezels measured off a current Pro phone and 13-inch tablet, the laptop
 * scaled off the picked mock, and the foldable's body less its glass. The
 * tablet's and the foldable's screen radii are guesses no source gives.
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
  foldable: { border: 20, bottom: 20, screenRadius: 48, bodyRadius: 68 },
} as const satisfies Record<Device, Bezel>

/**
 * A device's screen corners as a CSS `border-radius`, which the body and every
 * box drawn on its screen share. A laptop's screen meets its chin, so only
 * its top corners round.
 */
export function screenCorners(device: Device): string {
  const { screenRadius } = BEZELS[device]
  return device === 'laptop'
    ? `${screenRadius}px ${screenRadius}px 0 0`
    : `${screenRadius}px`
}

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
  button: '#2a2c31',
  islandText: '#ffffff',
  islandLive: '#34c759',
} as const

/**
 * The phone's island, a generic pill standing in for a size no source gives,
 * and the home bar, each centered on the screen and drawn over the frame.
 */
export const PHONE_ISLAND = { width: 81, height: 30, top: 14 } as const
export const HOME_BAR = { width: 140, height: 5, bottom: 8 } as const

/** The island's two widths, the compact pill and the wide one a call or a timer shows. */
export const ISLANDS = ['compact', 'wide'] as const

export type Island = (typeof ISLANDS)[number]

/** A layout entry's `island` as an island, compact for none or a value no reader knows. */
export function islandOf(value: unknown): Island {
  return value === 'wide' ? 'wide' : 'compact'
}

/** The wide island's width, scaled off the picked mock's ratio to the compact one. */
const WIDE_ISLAND_WIDTH = 126

/** The phone's island at its picked width, the wide one holding a timer. */
export function phoneIsland(island: Island): {
  width: number
  height: number
  top: number
} {
  return island === 'wide'
    ? { ...PHONE_ISLAND, width: WIDE_ISLAND_WIDTH }
    : { ...PHONE_ISLAND }
}

/** What the wide island shows, a running timer no frame sets, and the heights of the level bars beside it. */
export const WIDE_ISLAND_TIMER = '0:42'
export const WIDE_ISLAND_LEVEL = [5, 9, 7] as const

/** How far the phone's buttons stand past the body's side, in points. */
export const BUTTON_DEPTH = 4

/**
 * The phone's side buttons, each from the body's top edge, scaled off the
 * picked mock: the action button and two volume buttons on the left, and
 * the side button on the right.
 */
export const PHONE_BUTTONS = [
  { side: 'left', top: 142, height: 33 },
  { side: 'left', top: 195, height: 59 },
  { side: 'left', top: 266, height: 59 },
  { side: 'right', top: 222, height: 95 },
] as const satisfies readonly {
  side: 'left' | 'right'
  top: number
  height: number
}[]

/**
 * The phone's status bar, ending 10 below the island so a page under it
 * clears the island, its time and marks in the island's band `side` in from
 * each edge, past the screen's corner arc.
 */
export const STATUS_BAR = {
  height: PHONE_ISLAND.top + PHONE_ISLAND.height + 10,
  band: { top: PHONE_ISLAND.top, height: PHONE_ISLAND.height },
  side: 40,
  time: '9:41',
  font: 16,
} as const

/** The face the status bar and the wide island draw in, a system face every surface holds. */
export const STATUS_FONT = 'system-ui, -apple-system, sans-serif'

/** The status bar's signal bars, shortest first, and its battery, each in points. */
export const SIGNAL_BARS = [4, 6.5, 9, 11.5] as const
export const BATTERY = { width: 25, height: 12, radius: 3.5, cap: 2 } as const

/**
 * The ways a phone or a tablet is held, upright or turned a quarter with its
 * island on the left or on the right short side.
 */
export const TURNS = ['upright', 'left', 'right'] as const

export type Turn = (typeof TURNS)[number]

/** A layout entry's `turn` as a turn, upright for none or a value no reader knows. */
export function turnOf(value: unknown): Turn {
  return value === 'left' || value === 'right' ? value : 'upright'
}

/**
 * The turn Rotate goes to next, a quarter counterclockwise from upright so
 * the island stands on the left, then on the right, then upright again.
 */
export function nextTurn(turn: Turn | undefined): Turn {
  const at = TURNS.indexOf(turnOf(turn))
  return TURNS[(at + 1) % TURNS.length] ?? 'upright'
}

/** Whether a device turns, which only a phone or a tablet does. */
export function turnsWith(device: Device | null | undefined): boolean {
  return device === 'phone' || device === 'tablet'
}

/** A turned frame's box before the turn, which turning it upright restores. */
export interface UprightSize {
  width: number
  height: number
}

/** A layout entry's `upright` as a size, null for none or a value of another shape. */
export function uprightOf(value: unknown): UprightSize | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('width' in value) || !('height' in value)) return null
  const { width, height } = value
  if (typeof width !== 'number' || typeof height !== 'number') return null
  const whole = Number.isInteger(width) && Number.isInteger(height)
  return whole && width > 0 && height > 0 ? { width, height } : null
}

/**
 * The width that picks the device for a frame, its kept upright width while
 * turned, so a turned phone reads as a phone and never as the tablet its
 * landscape box is wide enough for.
 */
export function uprightWidth(entry: {
  width: number
  turn?: unknown
  upright?: unknown
}): number {
  const upright = uprightOf(entry.upright)
  return turnOf(entry.turn) !== 'upright' && upright
    ? upright.width
    : entry.width
}

/** Whether a device draws turned, which only a phone or a tablet does. */
export function isTurned(
  device: Device | null | undefined,
  turn: Turn | undefined,
): boolean {
  return turnsWith(device) && turnOf(turn) !== 'upright'
}

/**
 * The height the device's status bar takes off the top of a frame's box, 0
 * for any device but an upright phone, since a turned one hides its bar.
 */
export function topInset(
  device: Device | null | undefined,
  turn: Turn | undefined,
): number {
  return device === 'phone' && !isTurned(device, turn) ? STATUS_BAR.height : 0
}

/**
 * The page's box inside a frame's box, the box less the status bar while an
 * upright phone shows and the box itself on every other device or none. A
 * frame's box keeps the screen's size, and every surface reads the page
 * through this.
 */
export function pageBox(
  box: Box,
  device: Device | null | undefined,
  turn: Turn | undefined,
): Box {
  const inset = topInset(device, turn)
  return {
    x: box.x,
    y: box.y + inset,
    width: box.width,
    height: Math.max(0, box.height - inset),
  }
}

/**
 * The screen height of a turned hugging phone, the reference phone's
 * landscape screen at the box's width, since its box holds the reference
 * height of its upright width and its height is its page's.
 */
function turnedScreenHeight(width: number): number {
  const { width: short, height: long } = FRAME_SIZES.phone
  return Math.round((width * short) / long)
}

/**
 * The box a frame is shown at in present mode and entered in Play, one screen
 * tall for a page-tall phone so its page scrolls, else the stored box, which
 * a scroll frame already holds at its screen and a fixed turned one at its
 * landscape screen.
 */
export function shownBox<B extends { width: number; height: number }>(frame: {
  box: B
  device?: Device | null
  scroll?: boolean
  turn?: Turn
  hugHeight?: boolean
}): B {
  const { box, device, scroll, turn, hugHeight } = frame
  if (device !== 'phone' || scroll) return { ...box }
  if (!isTurned(device, turn)) {
    return { ...box, height: Math.min(box.height, referenceHeight(box.width)) }
  }
  if (!hugHeight) return { ...box }
  return { ...box, height: Math.min(box.height, turnedScreenHeight(box.width)) }
}

/** The page's corners as a CSS `border-radius`, square on top under an upright phone's status bar. */
export function pageCorners(device: Device, turn: Turn | undefined): string {
  if (device !== 'phone' || isTurned(device, turn)) {
    return screenCorners(device)
  }
  const { screenRadius } = BEZELS.phone
  return `0 0 ${screenRadius}px ${screenRadius}px`
}

/** A page's fill and text color as its status bar paints them, the fill null where the page paints none. */
export interface PageColors {
  fill: string | null
  ink: string
}

/**
 * The fill a page shows at its top and its text color, read off its root and
 * then its body as the browser paints the canvas. Self-contained, so a
 * browser runs it in the page by its source alone.
 */
export function pageColors(doc: Document = document): PageColors {
  const view = doc.defaultView
  const read = (element: Element | null) =>
    element && view ? view.getComputedStyle(element) : null
  const root = read(doc.documentElement)
  const body = read(doc.body)
  const painted = (color: string | undefined) =>
    color !== undefined &&
    color !== 'transparent' &&
    !/^rgba\(.*,\s*0\)$/.test(color)
  const fill =
    [root?.backgroundColor, body?.backgroundColor].find(painted) ?? null
  return { fill, ink: body?.color ?? root?.color ?? 'CanvasText' }
}

/** The ways a foldable is held, each a screen the frame's box takes the size of. */
export const POSES = ['closed', 'half', 'open'] as const

export type Pose = (typeof POSES)[number]

/**
 * Each pose's screen in points, the cover display closed and the inner one
 * half open and open. The published pixel counts at three pixels to a point,
 * a scale no source states for this device.
 */
export const POSE_SIZES = {
  closed: { width: 466, height: 678 },
  half: { width: 890, height: 626 },
  open: { width: 890, height: 626 },
} as const satisfies Record<Pose, { width: number; height: number }>

/** A layout entry's `pose` as a pose, closed for none or a value no reader knows. */
export function poseOf(value: unknown): Pose {
  return POSES.find((pose) => pose === value) ?? 'closed'
}

/** The pose a frame this wide starts in, closed or open, whichever moves its box least. */
export function nearestPose(width: number): Pose {
  const closed = Math.abs(width - POSE_SIZES.closed.width)
  const open = Math.abs(width - POSE_SIZES.open.width)
  return closed <= open ? 'closed' : 'open'
}

/**
 * The foldable's island, a generic pill, centered on the cover screen and on
 * the right half of the inner one, a place no source gives.
 */
export const FOLDABLE_ISLAND = { width: 100, height: 30, top: 14 } as const

/** Where the island's center sits across a pose's screen, as a share of its width. */
export function islandCenter(pose: Pose): number {
  return pose === 'closed' ? 0.5 : 0.75
}

/**
 * The band drawn down the middle of the inner screen, a faint crease open
 * and a shaded fold half open, null on the cover screen, which has no fold.
 */
export function foldBand(
  pose: Pose,
): { width: number; background: string } | null {
  if (pose === 'closed') return null
  if (pose === 'open') {
    return {
      width: 26,
      background:
        'linear-gradient(90deg, transparent, rgba(0,0,0,.05) 35%, rgba(0,0,0,.11) 50%, rgba(255,255,255,.5) 56%, transparent)',
    }
  }
  return {
    width: 150,
    background:
      'linear-gradient(90deg, transparent, rgba(0,0,0,.10) 30%, rgba(0,0,0,.34) 49%, rgba(0,0,0,.34) 51%, rgba(0,0,0,.08) 70%, transparent)',
  }
}

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

/** How far a device's parts stand past its body's sides, a laptop's base or a phone's buttons. */
function sideReach(device: Device, width: number): number {
  if (device === 'laptop') return baseReach(width)
  return device === 'phone' ? BUTTON_DEPTH : 0
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
 * none. A laptop's base reaches past its lid and a phone's buttons past its
 * sides, so their sides grow by more than their top. A turned phone's
 * buttons stand on its long edges, past its top and bottom instead.
 */
export function bezelBox(
  box: Box,
  device: Device | null | undefined,
  turn: Turn | undefined,
): Box {
  if (!device) return { ...box }
  const { border, bottom } = BEZELS[device]
  const reach = sideReach(device, box.width)
  const turned = isTurned(device, turn)
  const side = border + (turned ? 0 : reach)
  const end = turned ? reach : 0
  return {
    x: box.x - side,
    y: box.y - border - end,
    width: box.width + 2 * side,
    height: box.height + border + bottom + 2 * end,
  }
}

/**
 * The box a device paints around a frame's box on the board, being the body,
 * its one-unit edge, and the drop shadow `bezelShadow` blurs past both, the
 * box itself with none. A fit by `bezelBox` alone clips the edge and shadow.
 */
export function bezelReach(
  box: Box,
  device: Device | null | undefined,
  turn: Turn | undefined,
): Box {
  if (!device) return { ...box }
  const body = bezelBox(box, device, turn)
  const { border } = BEZELS[device]
  // The shadow drops by the border and blurs three borders past the screen.
  const left = Math.min(body.x - 1, box.x - 3 * border)
  const top = Math.min(body.y - 1, box.y - 2 * border)
  const right = Math.max(
    body.x + body.width + 1,
    box.x + box.width + 3 * border,
  )
  const bottom = Math.max(
    body.y + body.height + 1,
    box.y + box.height + 4 * border,
  )
  return { x: left, y: top, width: right - left, height: bottom - top }
}
