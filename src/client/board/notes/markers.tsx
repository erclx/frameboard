import { cn } from 'cn'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import { useMode } from '../mode'
import { cornerOf } from '../pin-corner'
import { usePreviewedFrames } from '../preview/store'
import { canvasView } from '../view'
import { Composer } from './composer'
import type { BoardPoint } from './pick'
import { Thread } from './thread'
import { closeNote, notesUi, useNotesUi } from './tool'

interface NotesLayerProps {
  /** The page's `<project>/<page>` ref. */
  page: string
  frames: readonly FrameRecord[]
  /** The canvas, whose iframes the markers find their elements in. */
  container: HTMLElement | null
}

/**
 * The page's notes on the canvas, in board coordinates on a layer that pans
 * and zooms with the frames: one amber numbered marker per open root note
 * at its element's corner, or its frame's once the element is lost, and the
 * composer or thread the Note tool has open. Markers hide in Play and once
 * a note is done.
 */
export function NotesLayer({ page, frames, container }: NotesLayerProps) {
  const notes = useLive((state) => state.notes[page])
  const playing = useMode((state) => state.mode === 'play')
  const open = useNotesUi((state) => state.open)
  // Markers read their elements' boxes from the live frames as they render,
  // so a frame load renders the layer again.
  useFrameLoads(container)
  useCloseOnEscape(open !== null)
  // A marker sits on the frame as drawn, at a previewed width included.
  const shown = usePreviewedFrames(frames)
  if (playing) return null

  const roots = (notes ?? []).filter(
    (note) => note.thread === null && note.state !== 'done',
  )
  const framesByName = new Map(shown.map((frame) => [frame.name, frame]))
  const place = (note: BoardNote): BoardPoint | null => {
    const frame = framesByName.get(note.frame)
    return frame ? cornerOf(frame, note.element, container) : null
  }
  const nextNumber =
    Math.max(0, ...(notes ?? []).map((note) => note.number ?? 0)) + 1

  const thread =
    open?.kind === 'thread' && open.page === page
      ? (notes ?? []).filter(
          (note) => note.id === open.id || note.thread === open.id,
        )
      : null
  const threadRoot = thread?.[0]
  const threadAt = threadRoot ? place(threadRoot) : null

  return (
    <>
      {roots.map((note) => {
        const at = place(note)
        if (!at || note.number === null) return null
        return (
          <Marker
            key={note.id}
            number={note.number}
            at={at}
            frame={framesByName.get(note.frame)?.ref}
            active={open?.kind === 'thread' && open.id === note.id}
            label={`Note ${note.number} on ${note.frame}`}
            onOpen={() =>
              notesUi.setState({ open: { kind: 'thread', page, id: note.id } })
            }
          />
        )
      })}
      {open?.kind === 'new' &&
      frames.some((frame) => frame.ref === open.pick.frame.ref) ? (
        <>
          <Marker number={nextNumber} at={open.pick.at} active />
          <Popover at={open.pick.at} onDismiss={closeNote}>
            <Composer
              key={open.pick.frame.ref}
              pick={open.pick}
              onClose={closeNote}
            />
          </Popover>
        </>
      ) : null}
      {thread && threadAt ? (
        <Popover at={threadAt} onDismiss={closeNote}>
          <Thread notes={thread} page={page} onClose={closeNote} />
        </Popover>
      ) : null}
    </>
  )
}

interface MarkerProps {
  number: number
  at: BoardPoint
  /** The frame's ref, which a frame drag finds the pins to shift by. */
  frame?: string
  active: boolean
  label?: string
  onOpen?: () => void
}

/**
 * A 22 px amber pin centered on its spot, as the design sits one on a
 * frame's corner, kept at screen size whatever the zoom, ringed while its
 * note is open.
 */
function Marker({ number, at, frame, active, label, onOpen }: MarkerProps) {
  const className = cn(
    'pointer-events-auto absolute grid size-[22px] place-items-center rounded-[11px_11px_11px_2px] bg-note text-label font-semibold text-[#1a1a1a] shadow-[0_2px_6px_rgba(0,0,0,.25)] outline-none [transform:translate(-50%,-50%)_scale(calc(1/var(--zoom,1)))] focus-visible:ring-3 focus-visible:ring-ring/50',
    active &&
      'shadow-[0_0_0_3px_color-mix(in_srgb,var(--note)_35%,transparent),0_2px_6px_rgba(0,0,0,.25)]',
  )
  const style = { left: at.x, top: at.y }
  return onOpen ? (
    <button
      type="button"
      data-note-marker
      data-note-frame={frame}
      aria-label={label}
      aria-expanded={active}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      className={className}
      style={style}
    >
      {number}
    </button>
  ) : (
    <span aria-hidden className={className} style={style}>
      {number}
    </span>
  )
}

/** How far a card sits from its marker's center, as the design sets it. */
const CARD_OFFSET = { x: 21, y: -25 }
/** The gap a card keeps from the canvas edge it would otherwise cross. */
const EDGE_GAP = 12

/**
 * Holds a note card beside its marker at screen size, on the marker's right
 * as the design sets it, or on its left when the right would run the card
 * under the inspector, capped at the canvas height and moved down or up to
 * stay inside it. A press outside the card or focus leaving it dismisses it,
 * a marker's press aside, since that opens the card the marker names.
 */
function Popover({
  at,
  onDismiss,
  children,
}: {
  at: BoardPoint
  onDismiss: () => void
  children: React.ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState<{
    flip: boolean
    y: number
    cap: number | null
  }>({ flip: false, y: 0, cap: null })
  useEffect(() => {
    const press = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && card.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-note-marker]'))
        return
      onDismiss()
    }
    document.addEventListener('pointerdown', press, true)
    return () => document.removeEventListener('pointerdown', press, true)
  }, [onDismiss])
  // A zoom or a pan moves the marker on screen without moving `at`, so the
  // card measures again on each.
  const [moves, setMoves] = useState(0)
  useEffect(() => {
    const bump = () => setMoves((count) => count + 1)
    const offZoom = canvasView.onZoom(bump)
    const offHand = canvasView.onHandMove(bump)
    return () => {
      offZoom()
      offHand()
    }
  }, [])
  useLayoutEffect(() => {
    const element = card.current
    const canvas = element?.closest('[data-canvas]')
    if (!element || !canvas) return
    const bounds = canvas.getBoundingClientRect()
    // The toolbar floats over the canvas's foot, so the card ends above it.
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Tools"]',
    )
    const bottom = Math.min(
      bounds.bottom,
      toolbar?.getBoundingClientRect().top ?? bounds.bottom,
    )
    // The View only pill sits in the app's slot above the canvas's head, so
    // the card starts below it wherever the two overlap or not.
    const notice = document.querySelector('[data-view-only-notice]')
    const ceiling = Math.max(
      bounds.top,
      notice?.getBoundingClientRect().bottom ?? bounds.top,
    )
    const box = element.getBoundingClientRect()
    const right = shift.flip
      ? box.right + box.width + 2 * CARD_OFFSET.x
      : box.right
    const top = box.top - shift.y
    const next = {
      flip: right > bounds.right - EDGE_GAP,
      y:
        top < ceiling + EDGE_GAP
          ? ceiling + EDGE_GAP - top
          : Math.min(0, bottom - EDGE_GAP - (top + box.height)),
      // Taken from the canvas, the pill, and the toolbar, never the card, so
      // the cap and the shift cannot chase each other. The card sits at
      // screen size, so these screen measures need no zoom factor.
      cap: bottom - ceiling - 2 * EDGE_GAP,
    }
    // A shift moves the card it measured, so it settles once one repeats.
    if (
      next.flip !== shift.flip ||
      Math.abs(next.y - shift.y) > 0.5 ||
      next.cap !== shift.cap
    ) {
      setShift(next)
    }
  }, [at.x, at.y, shift, moves])
  return (
    <div
      className="absolute origin-top-left [transform:scale(calc(1/var(--zoom,1)))]"
      style={{ left: at.x, top: at.y }}
    >
      <div
        ref={card}
        className="absolute flex flex-col"
        onBlur={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && !event.currentTarget.contains(next)) {
            onDismiss()
          }
        }}
        style={{
          top: CARD_OFFSET.y + shift.y,
          maxHeight: shift.cap ?? undefined,
          ...(shift.flip ? { right: CARD_OFFSET.x } : { left: CARD_OFFSET.x }),
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Closes the open note card on Esc wherever focus sits, since a card opened
 * from its marker leaves focus on the marker rather than inside the card.
 */
function useCloseOnEscape(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNote()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [active])
}

/**
 * Counts frame loads under the canvas, so markers placed on elements move
 * once a frame reloads. A load does not bubble, so it is caught on the way
 * down.
 */
function useFrameLoads(container: HTMLElement | null): void {
  const [, setLoads] = useState(0)
  useEffect(() => {
    if (!container) return
    const bump = () => setLoads((count) => count + 1)
    container.addEventListener('load', bump, true)
    return () => container.removeEventListener('load', bump, true)
  }, [container])
}
