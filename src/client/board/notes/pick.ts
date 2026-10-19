import type { FrameRecord } from '@/shared/records/list'

import { elementIndex } from '../frame-dom'

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

/** The page's root and wrapper elements, a click on which is a note on the frame. */
const FRAME_LEVEL = new Set(['HTML', 'BODY'])

/**
 * The frame or element under a board point, topmost frame first, or null
 * over bare canvas. It hit-tests inside a live frame's iframe on its own, so
 * it needs no selection, and a frame drawn as a placeholder takes a frame
 * note.
 */
export function pickAt(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
): NotePick | null {
  const frame = [...frames]
    .filter((candidate) => !candidate.hidden && contains(candidate.box, at))
    .sort((a, b) => b.order - a.order)[0]
  if (!frame) return null
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
  )
  const document = iframe?.contentDocument
  const target = document?.elementFromPoint(
    at.x - frame.box.x,
    at.y - frame.box.y,
  )
  // An iframe that has not finished a load names no file, so its click is a
  // frame note rather than an index the server cannot check.
  const renderedAt = iframe?.dataset.renderedAt ?? null
  const element =
    document && target && renderedAt && !FRAME_LEVEL.has(target.tagName)
      ? elementIndex(document, target)
      : null
  return {
    frame: { ref: frame.ref, name: frame.name },
    element,
    renderedAt: element === null ? null : renderedAt,
    at,
  }
}

function contains(box: FrameRecord['box'], { x, y }: BoardPoint): boolean {
  return (
    x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height
  )
}
