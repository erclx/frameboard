import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import type { FrameRecord } from '@/shared/records/list'
import type { TokenRow } from '@/shared/records/tokens'
import { RAW_GREY, shapePaint } from '@/shared/shape-paint'

import type { Box } from '../geometry/box'
import { OUTLINE, screen, sizeLabel } from '../geometry/draw'
import { CLICK_DISTANCE } from '../geometry/gestures'
import { CHIP, OVERLAY_Z } from '../geometry/overlay'
import { modeStore, useMode } from '../mode'
import type { BoardPoint } from '../notes/pick'
import { useTokenTable } from '../tokens'
import { gapUnder } from './gap'
import { finishDraft, type ShapeKind, shapeStore } from './tool'

const CORNERS = [
  { left: 0, top: 0 },
  { left: '100%', top: 0 },
  { left: 0, top: '100%' },
  { left: '100%', top: '100%' },
] as const

interface ShapeDraftProps {
  /** The canvas viewport, whose presses the draft follows. */
  viewport: RefObject<HTMLElement | null>
  /** The board point under a pointer event. */
  toBoard: (event: PointerEvent) => BoardPoint
  /** The layer the frames draw in, whose live documents a shape reads its fill from. */
  container: HTMLElement | null
  /** The page's frames where they draw, read at each press. */
  frames: () => readonly FrameRecord[]
  /** The project whose tokens paint a placed shape. */
  project: string
}

/**
 * What a drag draws: a Rectangle or Ellipse as the shape it places, in the
 * color it lands in, or the tinted box a Frame, Section, or Image drag draws.
 */
type Drawn =
  | { kind: 'box'; box: Box }
  | { kind: 'shape'; shape: ShapeKind; fill: string; box: Box }

/**
 * What a Rectangle, Ellipse, Image, Section, or Frame drag draws, from the
 * press to the pointer, once the press passes the click distance. A Rectangle
 * or Ellipse draws the shape in the fill it lands in, read from the frame
 * under the press, with the selection outline, its corners, and its size
 * under it, and draws nothing over bare canvas, where a release places
 * nothing. The others draw a tinted box as the marquee does.
 *
 * On release it leaves the box for `takeDraft`, so the click placing a shape
 * lands it at the gap the drag started in, at the size drawn, and the click
 * placing a frame lands it on the box. A Divider and Text draw nothing, and
 * their drag stays a click. The board never writes the frame to preview, so
 * the shape draws on the board's overlay and the file holds nothing until
 * release.
 */
export function ShapeDraft({
  viewport,
  toBoard,
  container,
  frames,
  project,
}: ShapeDraftProps) {
  const shape = useStore(shapeStore, (state) => state.shape)
  const tool = useMode((state) => (state.mode === 'edit' ? state.tool : null))
  const sizing =
    tool === 'frame' ||
    tool === 'section' ||
    tool === 'image' ||
    (tool === 'shape' && shape !== 'divider')
  const shaping = tool === 'shape' && shape !== 'divider' ? shape : null
  // Read at each press, so the listeners stay bound across a token reload.
  const tokens = useRef<readonly TokenRow[]>([])
  const keepTokens = useCallback((rows: readonly TokenRow[]) => {
    tokens.current = rows
  }, [])
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  useEffect(() => {
    const target = viewport.current
    if (!sizing || !target) return
    let press: {
      from: BoardPoint
      x: number
      y: number
      fill: string | null
    } | null = null
    let box: Box | null = null
    const down = (event: PointerEvent) => {
      finishDraft(null)
      box = null
      if (event.button !== 0 || modeStore.getState().spacePan) {
        press = null
        return
      }
      const from = toBoard(event)
      press = {
        from,
        x: event.clientX,
        y: event.clientY,
        fill:
          shaping && container
            ? fillUnder(container, frames(), from, tokens.current)
            : null,
      }
    }
    const move = (event: PointerEvent) => {
      if (!press) return
      const travel = Math.hypot(
        event.clientX - press.x,
        event.clientY - press.y,
      )
      if (!box && travel <= CLICK_DISTANCE) return
      box = rectFrom(press.from, toBoard(event))
      if (!shaping) setDrawn({ kind: 'box', box })
      else if (press.fill) {
        setDrawn({ kind: 'shape', shape: shaping, fill: press.fill, box })
      }
    }
    const up = () => {
      if (press && box) {
        finishDraft({
          from: press.from,
          at: { x: Math.round(box.x), y: Math.round(box.y) },
          size: {
            width: Math.max(1, Math.round(box.width)),
            height: Math.max(1, Math.round(box.height)),
          },
        })
      }
      press = null
      box = null
      setDrawn(null)
    }
    target.addEventListener('pointerdown', down)
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    return () => {
      target.removeEventListener('pointerdown', down)
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      finishDraft(null)
      setDrawn(null)
    }
  }, [sizing, shaping, viewport, toBoard, container, frames])
  const reader = shaping ? (
    <TokenReader project={project} onTokens={keepTokens} />
  ) : null
  // The reader keeps one place in the tree, so a drag never remounts it and
  // fetches the tokens again.
  return (
    <>
      {reader}
      {sizing && drawn ? <DraftPreview drawn={drawn} /> : null}
    </>
  )
}

/** The box or shape a drag draws, as `ShapeDraft` describes it. */
function DraftPreview({ drawn }: { drawn: Drawn }) {
  const { box } = drawn
  if (drawn.kind === 'box') {
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
  return (
    <div
      data-shape-draft
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex: OVERLAY_Z,
      }}
    >
      <div
        data-shape-fill
        className="size-full"
        style={{
          background: drawn.fill,
          borderRadius: drawn.shape === 'ellipse' ? '50%' : undefined,
        }}
      />
      <div className="absolute inset-0" style={{ outline: OUTLINE }}>
        {CORNERS.map((corner) => (
          <span
            key={`${corner.left}-${corner.top}`}
            className="absolute -translate-1/2 border-primary bg-white"
            style={{
              ...corner,
              width: screen(7),
              height: screen(7),
              borderWidth: screen(1.5),
            }}
          />
        ))}
        <span data-chip className={CHIP}>
          {sizeLabel({
            ...box,
            width: Math.max(1, Math.round(box.width)),
            height: Math.max(1, Math.round(box.height)),
          })}
        </span>
      </div>
    </div>
  )
}

interface TokenReaderProps {
  project: string
  onTokens: (tokens: readonly TokenRow[]) => void
}

/** Hands on the project's tokens while it is drawn, so only an armed shape tool reads them. */
function TokenReader({ project, onTokens }: TokenReaderProps) {
  const table = useTokenTable(project)
  useEffect(() => {
    onTokens(table?.tokens ?? [])
  }, [table, onTokens])
  return null
}

/**
 * The color a shape placed at `at` fills with, resolved in the live document
 * of the frame under it, in that frame's theme, since the board's own sheet
 * sets tokens of the same names. Null where a release places nothing.
 */
function fillUnder(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  tokens: readonly TokenRow[],
): string | null {
  const under = gapUnder(container, frames, at)
  if (!under) return null
  const shown = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(under.frame.ref)}"] iframe`,
  )?.contentDocument
  const view = shown?.defaultView
  if (!shown?.body || !view) return RAW_GREY
  // Added and taken out in one task, so the frame never paints it.
  const probe = shown.createElement('div')
  probe.style.background = shapePaint(tokens).fill
  shown.body.append(probe)
  const color = view.getComputedStyle(probe).backgroundColor
  probe.remove()
  return color || RAW_GREY
}

function rectFrom(a: BoardPoint, b: BoardPoint): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
