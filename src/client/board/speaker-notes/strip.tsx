import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { bezelBox } from '@/shared/frame-device'
import { SPEAKER_NOTES_MAX, speakerNotesOf } from '@/shared/records/board'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'

import { POSE_BAR_ROOM } from '../device/poses'
import { useDrawnBox } from '../geometry/write'
import { inspectorTabStore } from '../inspector/tab-store'
import { reportRefusal } from '../left-panel/page-actions'
import { useMode } from '../mode'
import { useSelection } from '../selection'
import { stripRoomStore } from './room'

const COUNT = new Intl.NumberFormat('en-US')

interface SpeakerNotesStripProps {
  /** The page's shown frames, which the selected one is found among. */
  frames: readonly FrameRecord[]
  /** The sessions holding frames, by ref, which turn a held frame's strip off. */
  claims?: Readonly<Record<string, Claim>>
  /** The server calls the strip writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * The speaker notes strip under one selected slide, shown while the Slides
 * tab is open or the slide already holds a note. Mounted above the hit
 * layer, as the label's rename field is, so a press places the caret.
 */
export function SpeakerNotesStrip({
  frames,
  claims,
  calls = structure,
}: SpeakerNotesStripProps) {
  const selected = useSelection((state) =>
    state.frames.length === 1 ? state.frames[0] : null,
  )
  const slidesOpen =
    useStore(inspectorTabStore, (state) => state.tab) === 'slides'
  const playing = useMode((state) => state.mode === 'play')
  const frame = frames.find((candidate) => candidate.ref === selected)
  if (!frame || playing || !(slidesOpen || frame.speakerNotes)) return null
  return (
    <StripAt
      key={frame.ref}
      frame={frame}
      claim={claims?.[frame.ref]}
      calls={calls}
    />
  )
}

function StripAt({
  frame,
  claim,
  calls,
}: {
  frame: FrameRecord
  claim?: Claim
  calls: Structure
}) {
  const drawn = useDrawnBox(frame)
  const body = bezelBox(drawn, frame.device, frame.turn)
  const canWrite = useLive((state) => state.canWrite)
  const stored = frame.speakerNotes ?? ''
  // What is being typed, null while the field shows the stored note.
  const [draft, setDraft] = useState<string | null>(null)
  // A committed note shown until the board carries it, so the field never flashes back.
  const [saved, setSaved] = useState<string | null>(null)
  const [heldStored, setHeldStored] = useState(stored)
  if (heldStored !== stored) {
    setHeldStored(stored)
    setSaved(null)
  }
  const cancelled = useRef(false)
  // The stored note a draft began from, sent with the write so an agent's newer note is never overwritten.
  const base = useRef(stored)
  const room = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const off = claim
    ? `${claim.tag} is editing ${frame.name}, so notes are off.`
    : null
  const readOnly = !canWrite || off !== null
  const shown = draft ?? saved ?? stored
  const over = draft !== null && draft.length > SPEAKER_NOTES_MAX

  useEffect(() => {
    const element = room.current
    if (!element) return
    const publish = () =>
      stripRoomStore.setState({ ref: frame.ref, height: element.offsetHeight })
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (stripRoomStore.getState().ref === frame.ref) {
        stripRoomStore.setState({ ref: null, height: 0 })
      }
    }
  }, [frame.ref])

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      return
    }
    if (draft === null) return
    if (draft.length > SPEAKER_NOTES_MAX) {
      reportRefusal('Couldn’t save the speaker notes')(
        new Error(overLimit(draft.length)),
      )
      return
    }
    const text = draft
    const from = base.current
    setDraft(null)
    if ((speakerNotesOf(text) ?? '') === from) return
    setSaved(text)
    calls.setSpeakerNotes(frame.ref, text, from).catch((error: unknown) => {
      // Kept in the field, so a note an agent set meanwhile and this draft both stay in view.
      setSaved(null)
      setDraft(text)
      reportRefusal('Couldn’t save the speaker notes')(error)
    })
  }

  return (
    <div
      ref={room}
      data-speaker-notes={frame.ref}
      className={
        // Hidden while a drag carries the frame, which writes the frames' layer and not this one.
        'pointer-events-auto absolute origin-top-left @container [transform:scale(calc(1/var(--zoom,1)))] [[data-layer]:has([data-move-chip]:not([hidden]))~[data-notes-layer]_&]:invisible'
      }
      style={{
        left: body.x,
        // A foldable's pose buttons take the room right under its body.
        top:
          frame.device === 'foldable'
            ? `calc(${body.y + body.height}px + ${POSE_BAR_ROOM}px / var(--zoom, 1))`
            : body.y + body.height,
        width: `calc(${body.width}px * var(--zoom, 1))`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {/* At low zoom the strip hides rather than shrink past reading, as the label does. */}
      <div className="pt-2 @max-[199px]:hidden">
        <div className="rounded-lg bg-card px-2.5 py-2 text-[11px] text-card-foreground shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1.5px_var(--primary)]">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={id} className="font-semibold">
              Speaker notes
            </label>
            <span id={`${id}-hint`} className="truncate text-muted-foreground">
              only you see these
            </span>
          </div>
          <textarea
            ref={field}
            id={id}
            value={shown}
            rows={1}
            readOnly={readOnly}
            placeholder={
              readOnly
                ? 'No speaker notes on this slide'
                : 'What you’ll say over this slide'
            }
            aria-describedby={[
              `${id}-hint`,
              over || off ? `${id}-status` : null,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={over || undefined}
            onFocus={() => {
              if (readOnly) return
              base.current = saved ?? stored
              setDraft(shown)
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                cancelled.current = true
                field.current?.blur()
              } else if (
                event.key === 'Enter' &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault()
                field.current?.blur()
              }
            }}
            className="block max-h-48 w-full resize-none overflow-y-auto bg-transparent leading-normal [field-sizing:content] outline-none placeholder:text-muted-foreground"
          />
          {over || off ? (
            <p
              id={`${id}-status`}
              className={
                over
                  ? 'mt-1.5 text-destructive'
                  : 'mt-1.5 text-muted-foreground'
              }
            >
              {over ? overLimit(draft.length) : off}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function overLimit(length: number): string {
  return `Notes hold at most ${COUNT.format(SPEAKER_NOTES_MAX)} characters, and these have ${COUNT.format(length)}. Shorten them to save.`
}
