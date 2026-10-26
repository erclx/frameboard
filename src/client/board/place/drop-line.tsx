import { type RefObject, useEffect, useState } from 'react'
import { useStore } from 'zustand'

import type { FrameRecord } from '@/shared/records/list'

import { screen } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { useMode } from '../mode'
import type { BoardPoint } from '../notes/pick'
import { type GapLine, gapUnder, moveGapUnder } from './gap'
import { carriedStore } from './tool'

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
 * bare canvas or a frame still loading, where a click places nothing.
 *
 * While a Move drag carries the selected element, it draws the gap the
 * element would drop into instead, and nothing where a drop would leave it
 * where it is.
 */
export function DropLine({
  viewport,
  container,
  frames,
  toBoard,
}: DropLineProps) {
  const tool = useMode(
    (state) =>
      state.mode === 'edit' &&
      (state.tool === 'text' || state.tool === 'shape'),
  )
  const carried = useStore(carriedStore, (state) => state.carried)
  const placing = tool || carried !== null
  const [line, setLine] = useState<GapLine | null>(null)
  useEffect(() => {
    const target = viewport.current
    if (!placing || !target || !container) return
    const move = (event: PointerEvent) => {
      const at = toBoard(event)
      const under = carried
        ? moveGapUnder(container, frames(), at, carried)
        : gapUnder(container, frames(), at)
      const next = under && {
        ...under.gap.line,
        x: under.frame.box.x + under.gap.line.x,
        y: under.frame.box.y + under.gap.line.y,
      }
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
  if (!placing || !line) return null
  const across = line.height === 0
  return (
    <div
      data-drop-line
      aria-hidden
      className="pointer-events-none absolute rounded-full bg-primary"
      style={{
        left: line.x,
        top: line.y,
        width: across ? line.width : screen(2),
        height: across ? screen(2) : line.height,
        translate: across ? '0 -50%' : '-50% 0',
        zIndex: OVERLAY_Z,
      }}
    />
  )
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
