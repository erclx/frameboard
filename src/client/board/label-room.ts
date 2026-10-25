import type { FrameRecord } from '@/shared/records/list'

/**
 * The board-unit gap above each frame's top edge, up to the nearest frame
 * above it that overlaps it across. A frame with nothing above takes
 * `Infinity`, and one whose top another frame covers takes zero. The canvas
 * hides a label whose gap, at the current zoom, is shorter than the label,
 * so it never draws over the frame above. A pairwise pass, which stays cheap
 * at the frame counts a page holds.
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
