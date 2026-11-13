import { linkedBoxes } from '@/shared/frame-widths'
import type { FrameRecord } from '@/shared/records/list'

import type { ElementKey } from '../selection'
import type { Box, Point } from './box'
import type { Corner } from './resize'

/** The label strip's height on screen, which a click selects the frame through. */
export const LABEL_HEIGHT = 20

/** How far from a corner, in screen pixels, a press still takes its handle. */
export const HANDLE_REACH = 6

/** The selection's corner handle under a canvas point, null when none is in reach. */
export function cornerAt(
  bounds: Box,
  point: Point,
  zoom: number,
): Corner | null {
  const reach = HANDLE_REACH / zoom
  const near = (a: number, b: number) => Math.abs(a - b) <= reach
  const west = near(point.x, bounds.x)
  const east = near(point.x, bounds.x + bounds.width)
  const north = near(point.y, bounds.y)
  const south = near(point.y, bounds.y + bounds.height)
  if (north && west) return 'nw'
  if (north && east) return 'ne'
  if (south && west) return 'sw'
  if (south && east) return 'se'
  return null
}

/** The CSS cursor a corner's drag takes, along that corner's diagonal. */
export function cornerCursor(corner: Corner): 'nwse-resize' | 'nesw-resize' {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
}

/**
 * Whether a canvas point sits within reach of a box's edges, which is where
 * the selected element's outline and corner marks draw.
 */
export function onOutline(box: Box, point: Point, zoom: number): boolean {
  const reach = HANDLE_REACH / zoom
  const between = (value: number, start: number, end: number) =>
    value >= start - reach && value <= end + reach
  const near = (a: number, b: number) => Math.abs(a - b) <= reach
  const right = box.x + box.width
  const bottom = box.y + box.height
  return (
    (between(point.x, box.x, right) &&
      (near(point.y, box.y) || near(point.y, bottom))) ||
    (between(point.y, box.y, bottom) &&
      (near(point.x, box.x) || near(point.x, right)))
  )
}

/**
 * The topmost element matching `selector` drawn under a screen point, null
 * when none is. A label control draws under the hit layer at a constant
 * screen size, so it is found by where the layer drew it rather than by
 * canvas geometry.
 */
export function drawnAt(
  layer: ParentNode,
  selector: string,
  point: { clientX: number; clientY: number },
): HTMLElement | null {
  for (const drawn of layer.querySelectorAll<HTMLElement>(selector)) {
    const { left, right, top, bottom } = drawn.getBoundingClientRect()
    if (
      point.clientX >= left &&
      point.clientX <= right &&
      point.clientY >= top &&
      point.clientY <= bottom
    ) {
      return drawn
    }
  }
  return null
}

/** The frame whose findings badge sits under a screen point, null when none does. */
export function badgeAt(
  layer: ParentNode,
  point: { clientX: number; clientY: number },
): string | null {
  return (
    drawnAt(layer, '[data-findings-badge]', point)?.dataset.findingsBadge ??
    null
  )
}

function drawnBox({ style }: HTMLElement): Box {
  return {
    x: parseFloat(style.left),
    y: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height),
  }
}

/**
 * The box several selected elements draw around them on the canvas, and
 * whether it carries corner marks, being whether a corner drag scales them.
 * Null while fewer than two are selected or it has not measured.
 */
export function selectedGroupBox(
  layer: ParentNode,
): { box: Box; scales: boolean } | null {
  const drawn = layer.querySelector<HTMLElement>('[data-element-group]')
  return drawn
    ? {
        box: drawnBox(drawn),
        scales: drawn.querySelector('[data-element-corner]') !== null,
      }
    : null
}

/**
 * The selected element's outline box on the canvas, as the layer draws it,
 * null while none draws. With several selected, the last picked's, which the
 * layer draws last.
 */
export function selectedElementBox(layer: ParentNode): Box | null {
  const drawn = [
    ...layer.querySelectorAll<HTMLElement>('[data-element-selection]'),
  ].at(-1)
  return drawn ? drawnBox(drawn) : null
}

/**
 * The outline of the selected element under a canvas point, the last picked
 * winning where they overlap, else the last picked's, for a menu to read as
 * the element a right-click landed on or the frame around it.
 */
export function selectedElementBoxAt(
  layer: ParentNode,
  point: Point,
): Box | null {
  const under = selectedElementBoxes(layer)
    .reverse()
    .find(({ box }) => within(box, point))
  return under?.box ?? selectedElementBox(layer)
}

/** Every selected element's outline on the canvas by its index, the last picked last. */
export function selectedElementBoxes(
  layer: ParentNode,
): { index: number; box: Box }[] {
  return [
    ...layer.querySelectorAll<HTMLElement>('[data-element-selection]'),
  ].flatMap((drawn) => {
    const index = Number(drawn.dataset.elementIndex)
    return Number.isInteger(index) ? [{ index, box: drawnBox(drawn) }] : []
  })
}

/**
 * The element whose ghost draws under a canvas point, null when none does.
 * A ghost shows only the part of an element past its frame's edge, so a
 * point inside the frame is left to the frame. It reads the boxes the layer
 * drew in canvas units, so the zoom moves nothing.
 */
export function ghostAt(
  layer: ParentNode,
  frames: readonly FrameRecord[],
  point: Point,
): ElementKey | null {
  const ghosts = [
    ...layer.querySelectorAll<HTMLElement>('[data-element-ghost]'),
  ].reverse()
  for (const ghost of ghosts) {
    const { ghostFrame, ghostIndex, ghostHash } = ghost.dataset
    const frame = frames.find(({ ref }) => ref === ghostFrame)
    if (!frame || ghostIndex === undefined || ghostHash === undefined) continue
    const { left, top, width, height } = ghost.style
    const box = {
      x: parseFloat(left),
      y: parseFloat(top),
      width: parseFloat(width),
      height: parseFloat(height),
    }
    if (within(box, point) && !within(frame.box, point)) {
      return { frame: frame.ref, index: Number(ghostIndex), hash: ghostHash }
    }
  }
  return null
}

function within(box: Box, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

/** The boxes a frame draws: its own, then each linked width's, which all answer as the frame. */
function drawnBoxes({
  box,
  widths,
}: Pick<FrameRecord, 'box' | 'widths'>): Box[] {
  return [box, ...linkedBoxes(box, widths)]
}

/**
 * The topmost shown frame under a canvas point, the strip above it where its
 * label sits counting as the frame, and a linked width's box and strip
 * counting as the frame it shows. `frames` comes bottom to top, as the board
 * lists a page, and `zoom` sizes the strip, which keeps its screen size.
 */
export function frameAt(
  frames: readonly FrameRecord[],
  point: Point,
  zoom: number,
): FrameRecord | null {
  const strip = LABEL_HEIGHT / zoom
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]
    if (!frame || frame.hidden) continue
    const hit = drawnBoxes(frame).some(
      ({ x, y, width, height }) =>
        point.x >= x &&
        point.x <= x + width &&
        point.y >= y - strip &&
        point.y <= y + height,
    )
    if (hit) return frame
  }
  return null
}

/** The shown frames a marquee rectangle touches, by their own box or a linked one, in the order given. */
export function framesIn(
  frames: readonly FrameRecord[],
  rect: Box,
): FrameRecord[] {
  return frames.filter(
    (frame) =>
      !frame.hidden &&
      drawnBoxes(frame).some(
        (box) =>
          box.x <= rect.x + rect.width &&
          box.x + box.width >= rect.x &&
          box.y <= rect.y + rect.height &&
          box.y + box.height >= rect.y,
      ),
  )
}
