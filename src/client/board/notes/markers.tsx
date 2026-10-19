import { cn } from 'cn'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import { elementAt } from '../frame-dom'
import { useMode } from '../mode'
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
  if (playing) return null

  const roots = (notes ?? []).filter(
    (note) => note.thread === null && note.state !== 'done',
  )
  const framesByName = new Map(frames.map((frame) => [frame.name, frame]))
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
          <Popover at={open.pick.at}>
            <Composer
              key={open.pick.frame.ref}
              pick={open.pick}
              onClose={closeNote}
            />
          </Popover>
        </>
      ) : null}
      {thread && threadAt ? (
        <Popover at={threadAt}>
          <Thread notes={thread} page={page} onClose={closeNote} />
        </Popover>
      ) : null}
    </>
  )
}

interface MarkerProps {
  number: number
  at: BoardPoint
  active: boolean
  label?: string
  onOpen?: () => void
}

/**
 * A 22 px amber pin centered on its spot, as the design sits one on a
 * frame's corner, kept at screen size whatever the zoom, ringed while its
 * note is open.
 */
function Marker({ number, at, active, label, onOpen }: MarkerProps) {
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
 * under the inspector, and moved down or up to stay inside the canvas.
 */
function Popover({
  at,
  children,
}: {
  at: BoardPoint
  children: React.ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState({ flip: false, y: 0 })
  useLayoutEffect(() => {
    const element = card.current
    const canvas = element?.closest('[data-canvas]')
    if (!element || !canvas) return
    const bounds = canvas.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const right = shift.flip
      ? box.right + box.width + 2 * CARD_OFFSET.x
      : box.right
    const top = box.top - shift.y
    const next = {
      flip: right > bounds.right - EDGE_GAP,
      y:
        top < bounds.top + EDGE_GAP
          ? bounds.top + EDGE_GAP - top
          : Math.min(0, bounds.bottom - EDGE_GAP - (top + box.height)),
    }
    // A shift moves the card it measured, so it settles once one repeats.
    if (next.flip !== shift.flip || Math.abs(next.y - shift.y) > 0.5) {
      setShift(next)
    }
  }, [at.x, at.y, shift])
  return (
    <div
      className="absolute origin-top-left [transform:scale(calc(1/var(--zoom,1)))]"
      style={{ left: at.x, top: at.y }}
    >
      <div
        ref={card}
        className="absolute"
        style={{
          top: CARD_OFFSET.y + shift.y,
          ...(shift.flip ? { right: CARD_OFFSET.x } : { left: CARD_OFFSET.x }),
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Where a note's marker sits: the top right corner of its element while the
 * live frame holds it, else of the frame.
 */
function cornerOf(
  frame: FrameRecord,
  element: number | null,
  container: HTMLElement | null,
): BoardPoint {
  const { x, y, width } = frame.box
  const document =
    element === null
      ? null
      : container?.querySelector<HTMLIFrameElement>(
          `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
        )?.contentDocument
  const target =
    document && element !== null ? elementAt(document, element) : null
  if (!target) return { x: x + width, y }
  const rect = target.getBoundingClientRect()
  return { x: x + Math.min(rect.right, width), y: y + Math.max(rect.top, 0) }
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
