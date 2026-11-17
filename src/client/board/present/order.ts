import type { FrameRecord } from '@/shared/records/list'

/**
 * Frames in reading order, a frame joining the open row while its top sits
 * above that row's first frame's middle, and ties keeping stack order so the
 * order is stable.
 */
export function readingOrder(frames: readonly FrameRecord[]): FrameRecord[] {
  const byTop = [...frames].reverse().sort((a, b) => a.box.y - b.box.y)
  const rows: FrameRecord[][] = []
  for (const frame of byTop) {
    const row = rows.at(-1)
    const first = row?.[0]
    if (row && first && frame.box.y < first.box.y + first.box.height / 2) {
      row.push(frame)
    } else {
      rows.push([frame])
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.box.x - b.box.x))
}
