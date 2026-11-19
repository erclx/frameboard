import { type RefObject, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import type { GapLine } from '@/shared/frame-bridge/gap'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { assetUrl } from '../assets/describe'
import { screen } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { useMode } from '../mode'
import type { BoardPoint } from '../notes/pick'
import { tileDragStore } from './asset-drop'
import { type AssetSize, naturalSize } from './asset-size'
import { PlaceGhost } from './drop-ghost'
import { type FrameGap, gapUnder, moveGapUnder, newestOnly } from './gap'
import { armedStore, carriedStore, placedKind, placesElement } from './tool'
import { ghostFor, type GhostSpot } from './write'

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
 * The line at the gap a placement would land in, for a tool, a carried
 * element, or a dragged tile, and nothing over bare canvas, a loading frame,
 * or where a drop would leave the element in place. Where a tool's click
 * lands free, `PlaceGhost` shows the spot instead.
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
  const [ghost, setGhost] = useState<GhostSpot | null>(null)
  const armed = useArmedSize()
  useEffect(() => {
    if (!container) return
    const newest = newestOnly()
    // A native drag fires no `pointermove`, so the tile's point comes from its drop target.
    return tileDragStore.subscribe(({ at }) => {
      newest(at ? gapUnder(container, frames(), at) : null, (under) => {
        const next = under ? boardLine(under) : null
        setTileLine((held) => (sameLine(held, next) ? held : next))
      })
    })
  }, [container, frames])
  useEffect(() => {
    const target = viewport.current
    if (!placing || !target || !container) return
    const newest = newestOnly()
    const move = (event: PointerEvent) => {
      // A shape drag lands where its press began, so the line holds there,
      // and `ShapeDraft` draws the box in place of the ghost.
      if (!carried && event.buttons & 1 && sizesByDrag()) {
        newest(null, () => setGhost(null))
        return
      }
      const at = toBoard(event)
      const kind = carried ? null : placedKind()
      const asked = carried
        ? moveGapUnder(container, frames(), at, carried)
        : gapUnder(container, frames(), at)
      newest(asked, (under) => {
        const spot =
          under && kind ? ghostFor(kind, at, under, armed.current) : null
        setGhost((held) => (sameGhost(held, spot) ? held : spot))
        const next = under && !spot ? boardLine(under) : null
        setLine((held) => (sameLine(held, next) ? held : next))
      })
    }
    const leave = () =>
      newest(null, () => {
        setLine(null)
        setGhost(null)
      })
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerleave', leave)
    return () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerleave', leave)
      setLine(null)
      setGhost(null)
    }
  }, [placing, carried, viewport, container, frames, toBoard, armed])
  if (!dragged && placing && ghost) return <PlaceGhost spot={ghost} />
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
  const page = pageBox(frame.box, frame.device, frame.turn)
  return {
    ...gap.line,
    x: page.x + gap.line.x,
    y: page.y + gap.line.y,
  }
}

/**
 * The size the Image tool's armed file draws at, read once per file so the
 * ghost can fit it, null until read and for a file stating none.
 */
function useArmedSize(): RefObject<AssetSize | null> {
  const file = useStore(armedStore, (state) => state.file)
  const size = useRef<AssetSize | null>(null)
  useEffect(() => {
    size.current = null
    if (!file) return
    let current = true
    void naturalSize(assetUrl(file.project, file.path), file.kind).then(
      (read) => {
        if (current) size.current = read
      },
    )
    return () => {
      current = false
    }
  }, [file])
  return size
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

function sameGhost(a: GhostSpot | null, b: GhostSpot | null): boolean {
  if (a === b) return true
  if (a === null || b === null || a.kind !== b.kind) return false
  if (a.x !== b.x || a.y !== b.y) return false
  return (
    a.kind === 'text' ||
    b.kind === 'text' ||
    (a.width === b.width && a.height === b.height)
  )
}
