import { type RefObject, useEffect, useState } from 'react'
import { useStore } from 'zustand'

import type { FrameRecord } from '@/shared/records/list'

import { screen } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { useMode } from '../mode'
import type { BoardPoint } from '../notes/pick'
import { tileDragStore } from './asset-drop'
import { type FrameGap, type GapLine, gapUnder, moveGapUnder } from './gap'
import { carriedStore, placedKind, placesElement } from './tool'

interface DropLineProps {
  /** The canvas viewport, whose pointer moves the line follows. */
  viewport: RefObject<HTMLElement | null>
  /** The canvas layer holding the frames' iframes, which the line draws in. */
  container: HTMLElement | null
  /** The page's frames where they draw. */
  frames: () => readonly FrameRecord[]
  /** The board point under a pointer event. */
  toBoard: (event: PointerEvent) => BoardPoint
}

/**
 * The 2px line at the gap a placement tool's click would land in, in the
 * selection blue at a constant screen size, drawn while the Text or Shape
 * tool is on and the pointer is over a live frame. It draws nothing over
 * bare canvas or a frame still loading, where a click places nothing. While
 * a Rectangle, Ellipse, or Image press is held it stays at the gap the press began
 * in, where the drag sized shape lands.
 *
 * While a Move drag carries the selected element, it draws the gap the
 * element would drop into instead, and nothing where a drop would leave it
 * where it is. While an Assets tile is dragged over the canvas, it draws the
 * gap the file would land in, whatever the tool.
 */
export function DropLine({
  viewport,
  container,
  frames,
  toBoard,
}: DropLineProps) {
  const tool = useMode(
    (state) => state.mode === 'edit' && placesElement(state.tool),
  )
  const carried = useStore(carriedStore, (state) => state.carried)
  const dragged = useStore(tileDragStore, (state) => state.at)
  const placing = tool || carried !== null
  const [line, setLine] = useState<GapLine | null>(null)
  const [tileLine, setTileLine] = useState<GapLine | null>(null)
  useEffect(() => {
    if (!container) return
    // A native drag fires no `pointermove`, so the tile's point comes from its drop target.
    return tileDragStore.subscribe(({ at }) => {
      const under = at && gapUnder(container, frames(), at)
      const next = under ? boardLine(under) : null
      setTileLine((held) => (sameLine(held, next) ? held : next))
    })
  }, [container, frames])
  useEffect(() => {
    const target = viewport.current
    if (!placing || !target || !container) return
    const move = (event: PointerEvent) => {
      // A Rectangle, Ellipse, or Image drag lands at the gap its press began in, so
      // the line holds there, while Text and a Divider land under the release.
      if (!carried && event.buttons & 1 && sizesByDrag()) return
      const at = toBoard(event)
      const under = carried
        ? moveGapUnder(container, frames(), at, carried)
        : gapUnder(container, frames(), at)
      const next = under && boardLine(under)
      setLine((held) => (sameLine(held, next) ? held : next))
    }
    const leave = () => setLine(null)
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerleave', leave)
    return () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerleave', leave)
      setLine(null)
    }
  }, [placing, carried, viewport, container, frames, toBoard])
  const shown = dragged ? tileLine : placing ? line : null
  if (!shown) return null
  const across = shown.height === 0
  return (
    <div
      data-drop-line
      aria-hidden
      className="pointer-events-none absolute rounded-full bg-primary"
      style={{
        left: shown.x,
        top: shown.y,
        width: across ? shown.width : screen(2),
        height: across ? screen(2) : shown.height,
        translate: across ? '0 -50%' : '-50% 0',
        zIndex: OVERLAY_Z,
      }}
    />
  )
}

/** A gap's line where it draws on the board, offset by its frame's place. */
function boardLine({ frame, gap }: FrameGap): GapLine {
  return {
    ...gap.line,
    x: frame.box.x + gap.line.x,
    y: frame.box.y + gap.line.y,
  }
}

/** Whether the tool on now sizes its shape by a drag, as `ShapeDraft` draws one. */
function sizesByDrag(): boolean {
  const kind = placedKind()
  return kind === 'rectangle' || kind === 'ellipse' || kind === 'asset'
}

function sameLine(a: GapLine | null, b: GapLine | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height)
  )
}
