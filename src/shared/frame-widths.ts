import {
  bezelBox,
  type Device,
  deviceForWidth,
  topInset,
  type Turn,
} from './frame-device'
import { FRAME_GAP } from './frame-sizes'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A width a frame also shows at, with the height its view holds there. */
export interface LinkedWidth {
  width: number
  height: number
}

/**
 * A layout entry's `widths` as a clean list, anything malformed reading as
 * none, so it never refuses the page's layout.
 */
export function widthsOf(value: unknown): LinkedWidth[] {
  if (!Array.isArray(value)) return []
  const widths: LinkedWidth[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return []
    const { width, height } = item as Record<string, unknown>
    if (!isSize(width) || !isSize(height)) return []
    if (widths.some((linked) => linked.width === width)) return []
    widths.push({ width, height })
  }
  return widths
}

/**
 * The widths a layout entry draws: none for a frame naming the foldable,
 * whose poses are its sizes, whatever its `widths` lists.
 */
export function drawnWidths(entry: {
  widths?: unknown
  foldable?: unknown
}): LinkedWidth[] {
  return entry.foldable === true ? [] : widthsOf(entry.widths)
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/**
 * What a frame shows of its device: the one around its own box, and whether
 * its device is on, which each linked width follows with the device it names.
 */
export interface ShownDevice {
  device?: Device | null
  showDevice?: boolean
}

/** The device a linked width draws inside, the one its own width names while the frame shows its device. */
export function linkedDevice(
  { showDevice }: Pick<ShownDevice, 'showDevice'>,
  width: number,
): Device | null {
  return showDevice ? deviceForWidth(width) : null
}

/**
 * The device and turn a frame's view at a width draws its page under, its own
 * at its own width. A linked view stands upright in the device it names.
 */
export function viewDevice(
  frame: ShownDevice & { box: { width: number }; turn?: Turn },
  width: number,
): { device: Device | null; turn?: Turn } {
  return width === frame.box.width
    ? { device: frame.device ?? null, turn: frame.turn }
    : { device: linkedDevice(frame, width) }
}

/** The height a linked width's status bar takes off its box, so a hugging one holds its page and the bar. */
export function linkedBar(
  frame: Pick<ShownDevice, 'showDevice'>,
  width: number,
): number {
  return topInset(linkedDevice(frame, width), 'upright')
}

/** Where each linked width draws, in a row past the frame, each body the gap past the last. */
export function linkedBoxes(
  box: Box,
  widths: readonly LinkedWidth[],
  shown: ShownDevice = {},
): Box[] {
  const boxes: Box[] = []
  // A turned frame shows at no other width, so a frame with widths stands upright.
  let edge = rightOf(bezelBox(box, shown.device, 'upright'))
  for (const { width, height } of widths) {
    const device = linkedDevice(shown, width)
    const linked = { x: xPast(edge, width, device), y: box.y, width, height }
    boxes.push(linked)
    edge = rightOf(bezelBox(linked, device, 'upright'))
  }
  return boxes
}

function rightOf({ x, width }: Box): number {
  return x + width
}

/**
 * The box holding a frame, every linked width it draws, and the device body
 * around each, the frame's own with neither.
 */
export function drawnExtent(
  box: Box,
  widths: readonly LinkedWidth[],
  shown: ShownDevice = {},
): Box {
  // Upright, whose buttons reach furthest aside, so a frame placed past a turned one clears it too.
  const boxes = [
    bezelBox(box, shown.device, 'upright'),
    ...linkedBoxes(box, widths, shown).map((linked) =>
      bezelBox(linked, linkedDevice(shown, linked.width), 'upright'),
    ),
  ]
  const left = Math.min(...boxes.map(({ x }) => x))
  const top = Math.min(...boxes.map(({ y }) => y))
  const right = Math.max(...boxes.map(({ x, width }) => x + width))
  const bottom = Math.max(...boxes.map(({ y, height }) => y + height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The x a frame of this width takes so its device body, or the frame itself
 * with none, stands the gap past an edge.
 */
export function xPast(
  edge: number,
  width: number,
  device?: Device | null,
): number {
  // A placed frame starts upright.
  const body = bezelBox({ x: 0, y: 0, width, height: 0 }, device, 'upright')
  return edge + FRAME_GAP - body.x
}
