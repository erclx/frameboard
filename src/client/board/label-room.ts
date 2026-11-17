import type { FrameRecord } from '@/shared/records/list'

import { LABEL_HEIGHT } from './geometry/hit'

/**
 * The gap above each frame up to the nearest frame overlapping it across, so
 * the canvas can hide a label that would draw over the frame above.
 */
export function labelRoom(
  frames: readonly Pick<FrameRecord, 'ref' | 'box'>[],
): Map<string, number> {
  const rooms = new Map<string, number>()
  for (const { ref, box } of frames) {
    let room = Infinity
    for (const other of frames) {
      if (other.ref === ref) continue
      const across =
        other.box.x < box.x + box.width && other.box.x + other.box.width > box.x
      if (!across || other.box.y >= box.y) continue
      room = Math.min(
        room,
        Math.max(0, box.y - (other.box.y + other.box.height)),
      )
    }
    rooms.set(ref, room)
  }
  return rooms
}

/**
 * Marks crowded frames with `data-label-crowded`, writing attributes alone so
 * the zoom handler calls it every gesture frame with no React render.
 */
export function markCrowded(
  layer: ParentNode,
  rooms: ReadonlyMap<string, number>,
  zoom: number,
): void {
  for (const element of layer.querySelectorAll<HTMLElement>('[data-frame]')) {
    const room = rooms.get(element.dataset.frame ?? '') ?? Infinity
    element.toggleAttribute('data-label-crowded', room * zoom < LABEL_HEIGHT)
  }
}

/** Marks the frame under the pointer as `data-label-hover`, clearing it from every other, so a crowded label shows on hover. */
export function markHovered(layer: ParentNode, ref: string | null): void {
  for (const element of layer.querySelectorAll<HTMLElement>('[data-frame]')) {
    element.toggleAttribute('data-label-hover', element.dataset.frame === ref)
  }
}
