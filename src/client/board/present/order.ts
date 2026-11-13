import type { FrameRecord } from '@/shared/records/list'

/**
 * A page's frames in canvas reading order: rows top to bottom, each read
 * left to right. Frames are taken by top, and each joins the open row while
 * its top sits above the vertical middle of that row's first frame, so a row
 * of mixed heights with tops a few pixels apart reads as one. Sections play
 * no part. Frames at one position keep stack order, top of the stack first,
 * so the order is the same on every render. `frames` arrives bottom of the
 * stack first, as the server sends it, and hidden frames stay in.
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
