import type { Gap } from '@/shared/frame-bridge/gap'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request } from '../bridge/channel'
import { shownHashOf } from '../bridge/shown'
import { type BoardPoint, frameUnder } from '../notes/pick'

/** The gap under a board point, with the frame it is in and the hash of the bytes that frame shows. */
export interface FrameGap {
  frame: FrameRecord
  hash: string
  gap: Gap
}

/**
 * Asks the topmost frame under a point for its gap there, null over bare
 * canvas, a placeholder, or a page that has not announced its bytes, since
 * then nothing vouches for the indices.
 */
async function askGap(
  container: ParentNode,
  frame: FrameRecord,
  at: BoardPoint,
  carried?: number,
): Promise<FrameGap | null> {
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
  )
  if (!iframe || shownHashOf(iframe) === null) return null
  const page = pageBox(frame.box, frame.device, frame.turn)
  const point = { x: at.x - page.x, y: at.y - page.y }
  const shown = await request(
    iframe,
    'gap-at',
    carried === undefined ? { at: point } : { at: point, carried },
  )
  return shown ? { frame, ...shown } : null
}

/** The gap under a board point in the topmost live frame there, which a placement lands in. */
export function gapUnder(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
): Promise<FrameGap | null> {
  const frame = frameUnder(frames, at)
  return frame ? askGap(container, frame, at) : Promise.resolve(null)
}

/**
 * The gap a carried element could move to under a point, null where the move
 * would change nothing, could not land, or leaves its frame.
 */
export function moveGapUnder(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  { frame: ref, index }: { frame: string; index: number },
): Promise<FrameGap | null> {
  const frame = frameUnder(frames, at)
  return frame?.ref === ref
    ? askGap(container, frame, at, index)
    : Promise.resolve(null)
}

/**
 * Hands each answer to its `draw`, dropping one asked before the last drawn,
 * so two moves answering out of order show the newer move's line. A null
 * draws at once and drops every answer still out.
 */
export function newestOnly(): (
  asked: Promise<FrameGap | null> | null,
  draw: (under: FrameGap | null) => void,
) => void {
  let sent = 0
  let drawn = 0
  return (asked, draw) => {
    const turn = ++sent
    if (!asked) {
      drawn = turn
      draw(null)
      return
    }
    void asked.then((under) => {
      if (turn < drawn) return
      drawn = turn
      draw(under)
    })
  }
}
