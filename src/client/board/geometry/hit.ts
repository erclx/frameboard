import type { FrameRecord } from '@/shared/records/list'

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

/** The selected element's outline box on the canvas, as the layer draws it, null while none draws. */
export function selectedElementBox(layer: ParentNode): Box | null {
  const drawn = layer.querySelector<HTMLElement>('[data-element-selection]')
  if (!drawn) return null
  const { left, top, width, height } = drawn.style
  return {
    x: parseFloat(left),
    y: parseFloat(top),
    width: parseFloat(width),
    height: parseFloat(height),
  }
}

/**
 * The topmost shown frame under a canvas point, the strip above it where its
 * label sits counting as the frame. `frames` comes bottom to top, as the
 * board lists a page, and `zoom` sizes the strip, which keeps its screen size.
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
    const { x, y, width, height } = frame.box
    if (
      point.x >= x &&
      point.x <= x + width &&
      point.y >= y - strip &&
      point.y <= y + height
    ) {
      return frame
    }
  }
  return null
}

/** The shown frames a marquee rectangle touches, in the order given. */
export function framesIn(
  frames: readonly FrameRecord[],
  rect: Box,
): FrameRecord[] {
  return frames.filter(
    ({ hidden, box }) =>
      !hidden &&
      box.x <= rect.x + rect.width &&
      box.x + box.width >= rect.x &&
      box.y <= rect.y + rect.height &&
      box.y + box.height >= rect.y,
  )
}
