import { useEffect } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { screen } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { elapsed, initialOf } from './label'
import { useNow } from './use-now'
import {
  dropWaiting,
  type EditLabel,
  type Holder,
  useWaiting,
  type WaitingEdit,
} from './waiting'

/** The card's look, per agents/claim-full's `.blk`. */
const CARD =
  'pointer-events-none w-[280px] rounded-[10px] border border-[color-mix(in_srgb,var(--claim)_50%,var(--border))] bg-card px-3 py-2.5 text-xs leading-[1.45] text-card-foreground shadow-[0_10px_30px_rgba(0,0,0,0.3)]'

interface WaitingCardsProps {
  /** The page on the canvas, whose change cancels every waiting edit. */
  page: string
  /** The page's shown frames, below whose bottom edge a card is placed. */
  frames: readonly FrameRecord[]
}

/**
 * A card at the bottom edge of each frame a hand edit waits on, naming who
 * holds it and how long they have, drawn on the canvas layer at constant
 * screen size. Esc, leaving the page, and Play cancel every waiting edit,
 * and Play hides the cards.
 */
export function WaitingCards({ page, frames }: WaitingCardsProps) {
  const edits = useWaiting()
  const playing = useMode((state) => state.mode === 'play')

  useEffect(() => {
    if (playing) dropWaiting()
  }, [playing])
  // The canvas stays mounted across pages, so the old page's cleanup is the cancel.
  useEffect(() => () => dropWaiting(), [page])
  const waiting = edits.length > 0
  useEffect(() => {
    if (!waiting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dropWaiting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waiting])

  // A waiting move draws its frame at the dropped box, so the card follows that box.
  const drawn = usePendingFrames(frames)
  if (playing) return null
  const cards = cardsByFrame(edits)
  return drawn.flatMap((frame) => {
    const card = cards.get(frame.ref)
    if (!card) return []
    return (
      <div
        key={frame.ref}
        className="absolute origin-top-left [transform:scale(calc(1/var(--zoom,1)))]"
        style={{
          left: `calc(${frame.box.x}px + ${screen(72)})`,
          top: `calc(${frame.box.y + frame.box.height}px - ${screen(38)})`,
          zIndex: OVERLAY_Z + 1,
        }}
      >
        <Card frame={frame.name} {...card} />
      </div>
    )
  })
}

/**
 * The cards of waits on frames this page does not show, such as a rename of
 * another page in the list, docked at the canvas's bottom left outside the
 * scaled layer. The dock sits clear of the toolbar's row, being its 16px
 * inset, its 44px pill, and an 8px gap, so no column width brings the two
 * together.
 */
export function WaitingDock({ frames }: { frames: readonly FrameRecord[] }) {
  const edits = useWaiting()
  const playing = useMode((state) => state.mode === 'play')
  if (playing) return null
  const shown = new Set(frames.map((frame) => frame.ref))
  const docked = [...cardsByFrame(edits)].filter(([ref]) => !shown.has(ref))
  if (docked.length === 0) return null
  return (
    <div
      data-waiting-dock
      className="absolute bottom-[4.25rem] left-4 flex flex-col gap-2"
      style={{ zIndex: OVERLAY_Z + 1 }}
    >
      {docked.map(([ref, card]) => (
        <Card key={ref} frame={ref.slice(ref.lastIndexOf('/') + 1)} {...card} />
      ))}
    </div>
  )
}

/** What each frame's card shows, the newest edit on a frame speaking for it. */
function cardsByFrame(
  edits: readonly WaitingEdit[],
): Map<string, { label: EditLabel; holder: Holder }> {
  const byFrame = new Map<string, { label: EditLabel; holder: Holder }>()
  for (const edit of edits) {
    for (const holder of edit.holders) {
      byFrame.set(holder.frame, { label: edit.label, holder })
    }
  }
  return byFrame
}

function Card({
  frame,
  label,
  holder,
}: {
  frame: string
  label: EditLabel
  holder: Holder
}) {
  // Ticks only while a card shows, so a page with no wait renders nothing each second.
  const now = useNow()
  const tag = `${initialOf(holder.tag)}${holder.tag.slice(1)}`
  return (
    <div data-waiting-card={holder.frame} role="status" className={CARD}>
      <b className="block font-semibold">
        {tag} is editing {frame}
      </b>
      <span className="text-muted-foreground">
        Your {label} will wait until it finishes, about{' '}
        <span data-waiting-elapsed>{elapsed(holder.claimedAt, now)}</span> so
        far.
      </span>
    </div>
  )
}
