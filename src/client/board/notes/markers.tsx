import { cn } from 'cn'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { useLive } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import { HANDLE_REACH } from '../geometry/hit'
import { useDrawnFrames } from '../geometry/write'
import { useMode } from '../mode'
import { cornerOf } from '../pin-corner'
import { canvasView } from '../view'
import { Composer } from './composer'
import type { BoardPoint } from './pick'
import { PinList } from './pin-list'
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
 * composer or thread the Note tool has open. Two or more notes whose pins would
 * overlap at the current zoom show as one pin carrying their count, which
 * opens a list of them.
 * Markers hide in Play and once a note is done.
 */
export function NotesLayer({ page, frames, container }: NotesLayerProps) {
  const notes = useLive((state) => state.notes[page])
  const playing = useMode((state) => state.mode === 'play')
  const open = useNotesUi((state) => state.open)
  // Pins keep screen size, so whether two overlap turns on the zoom.
  const zoom = useSyncExternalStore(
    canvasView.onZoom,
    canvasView.zoom,
    canvasView.zoom,
  )
  // The spot whose count pin has its list open.
  const [listed, setListed] = useState<string | null>(null)
  // Markers read their elements' boxes from the live frames as they render,
  // so a frame load renders the layer again.
  useFrameLoads(container)
  useCloseOnEscape(open !== null)
  // A marker sits on the frame as drawn, at a previewed width and at a
  // released box the board has not carried back yet, so a pin a drag shifted
  // stays where the drag left it.
  const shown = useDrawnFrames(frames)
  if (playing) return null

  const framesByName = new Map(shown.map((frame) => [frame.name, frame]))
  const place = (note: BoardNote): BoardPoint | null => {
    const frame = framesByName.get(note.frame)
    return frame ? cornerOf(frame, note.element, container) : null
  }
  const spots = spotsOf(
    (notes ?? []).filter(
      (note) => note.thread === null && note.state !== 'done',
    ),
    place,
    zoom,
  )
  const nextNumber =
    Math.max(0, ...(notes ?? []).map((note) => note.number ?? 0)) + 1
  const openThread = (id: string) => {
    setListed(null)
    notesUi.setState({ open: { kind: 'thread', page, id } })
  }

  const thread =
    open?.kind === 'thread' && open.page === page
      ? (notes ?? []).filter(
          (note) => note.id === open.id || note.thread === open.id,
        )
      : null
  const threadRoot = thread?.[0]
  // A thread opened from a count pin's list anchors its card at that pin.
  const threadAt = threadRoot
    ? (spots.find((spot) => spot.notes.some((n) => n.id === threadRoot.id))
        ?.at ?? place(threadRoot))
    : null
  const list = spots.find(
    (spot) => spot.key === listed && spot.notes.length > 1,
  )
  // A zoom can split the listed spot, so its list closes rather than
  // reopening on whichever spot later takes its key.
  if (listed !== null && !list) setListed(null)
  const closeList = (spot: string) => {
    setListed(null)
    document
      .querySelector<HTMLElement>(`[data-note-spot="${CSS.escape(spot)}"]`)
      ?.focus()
  }

  return (
    <>
      {spots.map((spot) => {
        const [first] = spot.notes
        if (!first || first.number === null) return null
        const frame = framesByName.get(first.frame)?.ref
        if (spot.notes.length === 1) {
          return (
            <Marker
              key={first.id}
              content={first.number}
              at={spot.at}
              frame={frame}
              element={first.element}
              active={open?.kind === 'thread' && open.id === first.id}
              label={`Note ${first.number} on ${first.frame}`}
              onOpen={() => openThread(first.id)}
            />
          )
        }
        const threadOpen = spot.notes.some(
          (note) => open?.kind === 'thread' && open.id === note.id,
        )
        return (
          <Marker
            key={spot.key}
            content={spot.notes.length}
            at={spot.at}
            frame={frame}
            element={first.element}
            spot={spot.key}
            active={threadOpen || listed === spot.key}
            expanded={listed === spot.key}
            label={`${spot.notes.length} notes on ${first.frame}`}
            onOpen={() => {
              closeNote()
              setListed((current) => (current === spot.key ? null : spot.key))
            }}
          />
        )
      })}
      {open?.kind === 'new' &&
      frames.some((frame) => frame.ref === open.pick.frame.ref) ? (
        <>
          <Marker content={nextNumber} at={open.pick.at} active />
          <Popover at={open.pick.at} onDismiss={closeNote}>
            <Composer
              key={open.pick.frame.ref}
              pick={open.pick}
              onClose={closeNote}
            />
          </Popover>
        </>
      ) : null}
      {list ? (
        <Popover at={list.at} onDismiss={() => setListed(null)}>
          <PinList
            title={`${list.notes.length} notes on ${list.notes[0]?.frame}`}
            notes={list.notes}
            onPick={(id) => {
              closeList(list.key)
              openThread(id)
            }}
            onClose={() => closeList(list.key)}
          />
        </Popover>
      ) : null}
      {thread && threadAt ? (
        <Popover at={threadAt} onDismiss={closeNote}>
          <Thread notes={thread} page={page} onClose={closeNote} />
        </Popover>
      ) : null}
    </>
  )
}

/** Open root notes sharing one pin, with the point the pin draws at. */
interface Spot {
  /** The id of the note whose point the spot took. */
  key: string
  at: BoardPoint
  notes: BoardNote[]
}

/**
 * Groups the root notes by where their pins draw at `zoom`, a note joining the
 * first spot whose pin its own would overlap, each spot's notes in number
 * order. A note joins a spot by the spot's point rather than its last member's,
 * so a row of close notes never chains into one pin wider than a pin. A note
 * with no number or no point draws nowhere.
 */
function spotsOf(
  roots: readonly BoardNote[],
  place: (note: BoardNote) => BoardPoint | null,
  zoom: number,
): Spot[] {
  // Pins share their offset from their points, so two overlap when their
  // points sit closer than a pin's side on both axes.
  const reach = PIN_SIZE / zoom
  const spots: Spot[] = []
  for (const note of roots) {
    const at = place(note)
    if (!at || note.number === null) continue
    const spot = spots.find(
      (s) => Math.abs(s.at.x - at.x) < reach && Math.abs(s.at.y - at.y) < reach,
    )
    if (spot) spot.notes.push(note)
    else spots.push({ key: note.id, at, notes: [note] })
  }
  for (const spot of spots) {
    spot.notes.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  }
  return spots
}

interface MarkerProps {
  /** The note's number, or a count pin's count. */
  content: number
  at: BoardPoint
  /** The frame's ref, which a frame drag finds the pins to shift by. */
  frame?: string
  /** The note's element index, whose corner a frame resize moves the pin to. */
  element?: number | null
  /** A count pin's spot, which its list returns focus to on closing. */
  spot?: string
  active: boolean
  /** Whether the card the pin opens is open, its `active` unless given. */
  expanded?: boolean
  label?: string
  onOpen?: () => void
}

/** The pin's side, in screen pixels. */
const PIN_SIZE = 24
/**
 * How far the pin's bottom-left tail sits up and right of its spot, in screen
 * pixels: one past the reach of a frame's corner handle, so a press on the
 * north-east handle of a pinned frame still takes the handle.
 */
const TAIL_GAP = HANDLE_REACH + 1
/** Where the pin's center sits from its spot, in screen pixels. */
const PIN_CENTER = {
  x: TAIL_GAP + PIN_SIZE / 2,
  y: -(TAIL_GAP + PIN_SIZE / 2),
}

/**
 * A 24 px amber pin, the pointer target size, whose bottom-left tail points at its spot from just up
 * and right of it, kept at screen size whatever the zoom, ringed while its
 * note is open.
 */
function Marker({
  content,
  at,
  frame,
  element,
  spot,
  active,
  expanded = active,
  label,
  onOpen,
}: MarkerProps) {
  const className = cn(
    'pointer-events-auto absolute grid size-[24px] origin-top-left place-items-center rounded-[12px_12px_12px_2px] bg-note text-label font-semibold text-[#1a1a1a] shadow-[0_2px_6px_rgba(0,0,0,.25)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    active &&
      'shadow-[0_0_0_3px_color-mix(in_srgb,var(--note)_35%,transparent),0_2px_6px_rgba(0,0,0,.25)]',
  )
  // The scale comes first, so the translate after it reads in screen pixels.
  const style = {
    left: at.x,
    top: at.y,
    transform: `scale(calc(1 / var(--zoom, 1))) translate(${TAIL_GAP}px, ${-(TAIL_GAP + PIN_SIZE)}px)`,
  }
  return onOpen ? (
    <button
      type="button"
      data-note-marker
      data-note-frame={frame}
      data-note-element={element ?? undefined}
      data-note-spot={spot}
      aria-label={label}
      aria-haspopup={spot === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      className={className}
      style={style}
    >
      {content}
    </button>
  ) : (
    <span aria-hidden className={className} style={style}>
      {content}
    </span>
  )
}

/** How far a card sits from its marker's center, as the design sets it. */
const CARD_OFFSET = { x: 21, y: -25 }
/**
 * Where a card's near edges sit from the marker's spot, in screen pixels:
 * left of the spot on the right side, right of it once flipped, and above.
 */
const CARD_AT = {
  left: PIN_CENTER.x + CARD_OFFSET.x,
  right: CARD_OFFSET.x - PIN_CENTER.x,
  top: PIN_CENTER.y + CARD_OFFSET.y,
}
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
          top: CARD_AT.top + shift.y,
          maxHeight: shift.cap ?? undefined,
          ...(shift.flip ? { right: CARD_AT.right } : { left: CARD_AT.left }),
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
