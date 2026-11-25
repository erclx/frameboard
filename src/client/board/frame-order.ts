import type { FrameRecord, SectionRecord } from '@/shared/records/list'

export interface FrameGroup {
  /** The section holding the rows, absent for the frames in none. */
  section?: SectionRecord
  /** Top of the stack first. */
  rows: readonly FrameRecord[]
}

/**
 * The page's frames as Layers groups them: each section top first with its
 * frames, then the frames in no section. Both arrive bottom of the stack
 * first, as the server sends them.
 */
export function groupsOf(
  frames: readonly FrameRecord[],
  sections: readonly SectionRecord[],
): FrameGroup[] {
  const top = [...frames].reverse()
  const held = new Set(sections.flatMap((section) => section.frames))
  return [
    ...[...sections].reverse().map((section) => ({
      section,
      rows: top.filter((frame) => section.frames.includes(frame.name)),
    })),
    { rows: top.filter((frame) => !held.has(frame.name)) },
  ]
}

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

/** The frames a step walks, in Layers order, leaving out the hidden ones, which cannot select. */
export function stepOrder(
  frames: readonly FrameRecord[],
  sections: readonly SectionRecord[],
): FrameRecord[] {
  return groupsOf(frames, sections)
    .flatMap((group) => group.rows)
    .filter((frame) => !frame.hidden)
}

/**
 * The frame `by` places after `ref` in `order`, wrapping past either end,
 * undefined when `ref` is not in it.
 */
export function stepFrom(
  order: readonly FrameRecord[],
  ref: string,
  by: 1 | -1,
): FrameRecord | undefined {
  const at = order.findIndex((frame) => frame.ref === ref)
  if (at === -1) return undefined
  return order[(at + by + order.length) % order.length]
}
