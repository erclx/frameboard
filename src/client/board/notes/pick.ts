import type { PickAt } from '@/shared/frame-bridge/messages'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request } from '../bridge/channel'
import { shownHashOf } from '../bridge/shown'

/** A point on the board, in the canvas layer's own pixels. */
export interface BoardPoint {
  x: number
  y: number
}

/** What a click with the Note tool landed on. */
export interface NotePick {
  frame: Pick<FrameRecord, 'ref' | 'name'>
  /** The element's file index, or null for a note on the whole frame. */
  element: number | null
  /** The `modifiedAt` of the file the iframe showed, which an element note sends to be checked. */
  renderedAt: string | null
  /** Where the click landed, which the new note's pin and composer sit at. */
  at: BoardPoint
}

/** The topmost shown frame under a board point, the one a click there lands in. */
export function frameUnder(
  frames: readonly FrameRecord[],
  at: BoardPoint,
): FrameRecord | null {
  return (
    [...frames]
      .filter((candidate) => !candidate.hidden && contains(candidate.box, at))
      .sort((a, b) => b.order - a.order)[0] ?? null
  )
}

/** A note's pick with what the frame answered under the point, null where no live page answered. */
export interface FramePick extends NotePick {
  shown: PickAt | null
}

/**
 * The frame under a point and what its live page hit-tests there, the page
 * answering over the bridge, `unlocked` passing over locked elements. A
 * placeholder frame or a page that never answers takes a frame note.
 */
export async function readPick(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  { unlocked = false }: { unlocked?: boolean } = {},
): Promise<FramePick | null> {
  const frame = frameUnder(frames, at)
  if (!frame) return null
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
  )
  // A page that announced nothing has no bridge to wait on, so it takes a frame note at once.
  const page = pageBox(frame.box, frame.device, frame.turn)
  const shown =
    iframe && shownHashOf(iframe) !== null
      ? await request(iframe, 'pick-at', {
          at: { x: at.x - page.x, y: at.y - page.y },
          unlocked,
        })
      : null
  // An unloaded iframe names no file, so its click makes a frame note.
  const renderedAt = iframe?.dataset.renderedAt ?? null
  const element = renderedAt ? (shown?.chain[0]?.index ?? null) : null
  return {
    frame: { ref: frame.ref, name: frame.name },
    element,
    renderedAt: element === null ? null : renderedAt,
    at,
    shown,
  }
}

/**
 * The frame or element under a point, hit-tested inside a live iframe with no
 * selection, a placeholder frame taking a frame note.
 */
export async function pickAt(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
): Promise<NotePick | null> {
  const pick = await readPick(container, frames, at)
  if (!pick) return null
  const { shown: _shown, ...note } = pick
  return note
}

function contains(box: FrameRecord['box'], { x, y }: BoardPoint): boolean {
  return (
    x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height
  )
}
