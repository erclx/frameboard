import { type RefObject, useEffect, useState } from 'react'
import { useStore } from 'zustand'

import type { Box } from '../geometry/box'
import { screen } from '../geometry/draw'
import { CLICK_DISTANCE } from '../geometry/gestures'
import { OVERLAY_Z } from '../geometry/overlay'
import { modeStore, useMode } from '../mode'
import type { BoardPoint } from '../notes/pick'
import { finishDraft, shapeStore } from './tool'

interface ShapeDraftProps {
  /** The canvas viewport, whose presses the draft follows. */
  viewport: RefObject<HTMLElement | null>
  /** The board point under a pointer event. */
  toBoard: (event: PointerEvent) => BoardPoint
}

/**
 * The box a Rectangle or Ellipse drag draws, from the press to the pointer,
 * drawn as the marquee is once the press passes the click distance. On
 * release it leaves the size for `takeDraft`, so the click placing the
 * shape lands it at the gap the drag started in, at the size drawn. A
 * Divider and Text draw nothing, and their drag stays a click.
 */
export function ShapeDraft({ viewport, toBoard }: ShapeDraftProps) {
  const shape = useStore(shapeStore, (state) => state.shape)
  const sizing = useMode(
    (state) =>
      state.mode === 'edit' && state.tool === 'shape' && shape !== 'divider',
  )
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    const target = viewport.current
    if (!sizing || !target) return
    let press: { from: BoardPoint; x: number; y: number } | null = null
    let drawn: Box | null = null
    const down = (event: PointerEvent) => {
      finishDraft(null)
      drawn = null
      press =
        event.button === 0 && !modeStore.getState().spacePan
          ? { from: toBoard(event), x: event.clientX, y: event.clientY }
          : null
    }
    const move = (event: PointerEvent) => {
      if (!press) return
      const travel = Math.hypot(
        event.clientX - press.x,
        event.clientY - press.y,
      )
      if (!drawn && travel <= CLICK_DISTANCE) return
      drawn = rectFrom(press.from, toBoard(event))
      setBox(drawn)
    }
    const up = () => {
      if (press && drawn) {
        finishDraft({
          from: press.from,
          size: {
            width: Math.max(1, Math.round(drawn.width)),
            height: Math.max(1, Math.round(drawn.height)),
          },
        })
      }
      press = null
      drawn = null
      setBox(null)
    }
    target.addEventListener('pointerdown', down)
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    return () => {
      target.removeEventListener('pointerdown', down)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      finishDraft(null)
      setBox(null)
    }
  }, [sizing, viewport, toBoard])
  if (!sizing || !box) return null
  return (
    <div
      data-shape-draft
      aria-hidden
      className="pointer-events-none absolute bg-primary/10"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        border: `${screen(1)} solid var(--primary)`,
        zIndex: OVERLAY_Z,
      }}
    />
  )
}

function rectFrom(a: BoardPoint, b: BoardPoint): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
