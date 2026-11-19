import { bezelBox, BEZELS, type Device } from './frame-device'
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
 * Where each linked width draws, in a row past the frame, moved out by a
 * laptop base's reach so a taller width never meets it.
 */
export function linkedBoxes(
  box: Box,
  widths: readonly LinkedWidth[],
  device?: Device | null,
): Box[] {
  const boxes: Box[] = []
  // A turned frame shows at no other width, so a frame with widths stands upright.
  const body = bezelBox(box, device, 'upright')
  const lid = device ? BEZELS[device].border : 0
  let x = body.x + body.width - lid
  for (const { width, height } of widths) {
    x += FRAME_GAP
    boxes.push({ x, y: box.y, width, height })
    x += width
  }
  return boxes
}

/**
 * The box holding a frame, the device body drawn around it, and every linked
 * width it draws, the frame's own with neither. Linked widths draw no device.
 */
export function drawnExtent(
  box: Box,
  widths: readonly LinkedWidth[],
  device?: Device | null,
): Box {
  // Upright, whose buttons reach furthest aside, so a frame placed past a turned one clears it too.
  const boxes = [
    bezelBox(box, device, 'upright'),
    ...linkedBoxes(box, widths, device),
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
