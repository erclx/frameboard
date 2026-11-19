import { useEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import { themeStore, useShownTheme } from '@/client/theme/store'
import { bezelBox, shownBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { presentScale } from '../fit'
import { ScaledFrame, type StepWalk } from '../overlay'
import { useRoom } from '../room'
import { presentOrder, presentStore, usePresent } from '../store'
import {
  type AudienceMessage,
  joinAudience,
  type PresentedState,
  type PresenterLink,
} from '../sync'
import { formatClock, formatElapsed, useNow } from './timer'

type Phase =
  | { kind: 'waiting' }
  | { kind: 'ended' }
  | { kind: 'presenting'; state: PresentedState }

/** The step the audience last sent, which this window's own count never lowers for good. */
let sentStep = 0

/**
 * Mirrors the audience's slide and step into this window's own present store,
 * which the drawn slide counts its steps into, and clears it once presenting ends.
 */
function mirror(message: AudienceMessage): void {
  if (message.type === 'ended') {
    sentStep = 0
    presentStore.setState({ page: null, frame: null, step: 0, steps: 0 })
    return
  }
  sentStep = message.step
  const { page, frame } = presentStore.getState()
  presentStore.setState({
    page: message.page,
    frame: message.frame,
    step: message.step,
    ...(page !== message.page || frame !== message.frame ? { steps: 0 } : {}),
  })
}

/**
 * Puts the audience's step back once this window's count allows it, since a
 * count read before the slide's steps arrive clamps the step to what it found.
 */
function keepSentStep(): () => void {
  return presentStore.subscribe(({ page, step, steps }) => {
    const want = Math.min(sentStep, steps)
    if (page !== null && step !== want) presentStore.setState({ step: want })
  })
}

/**
 * Flips each frame this window draws opposite to its own theme where the
 * audience shows it that way, since a flip lives in one tab's memory.
 */
function useAudienceThemes(themes: PresentedState['themes'] | undefined) {
  const shown = useShownTheme()
  useEffect(() => {
    if (!themes) return
    const flipped = new Set(
      Object.entries(themes)
        .filter(([, theme]) => theme !== shown)
        .map(([ref]) => ref),
    )
    themeStore.setState({ flipped })
  }, [themes, shown])
}

/**
 * The audience's presentation as the window joining it hears it, with every
 * press in the window sent back to it.
 */
function useAudience(id: string | null): Phase {
  const [phase, setPhase] = useState<Phase>(() =>
    id ? { kind: 'waiting' } : { kind: 'ended' },
  )
  useEffect(() => {
    if (!id) return keysTo(null)
    const unkeep = keepSentStep()
    const joined = joinAudience(id, (message) => {
      mirror(message)
      setPhase(
        message.type === 'ended'
          ? { kind: 'ended' }
          : { kind: 'presenting', state: message },
      )
    })
    const unkeys = keysTo(joined)
    return () => {
      unkeys()
      unkeep()
      joined.close()
    }
  }, [id])
  return phase
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '])

/** What a press asks the audience for, null for a key the presenter window leaves alone. */
function commandOf(event: KeyboardEvent): 1 | -1 | 'leave' | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      return 1
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return -1
    case ' ':
      return event.shiftKey ? -1 : 1
    case 'Escape':
      return 'leave'
    default:
      return null
  }
}

/**
 * Sends the presenter's presses to the audience, and keeps every key from the
 * board's own bindings, which would run against the board from a window that
 * never shows it.
 */
function keysTo(link: PresenterLink | null): () => void {
  const press = (event: KeyboardEvent) => {
    event.stopPropagation()
    const within = (selector: string) =>
      event.target instanceof Element && event.target.closest(selector) !== null
    const onButton =
      (event.key === ' ' || event.key === 'Enter') && within('button')
    // A focused note keeps the keys that scroll it, and Left and Right still step.
    const scrollsNotes = SCROLL_KEYS.has(event.key) && within('[data-notes]')
    const command = onButton || scrollsNotes ? null : commandOf(event)
    if (command === null || !link) return
    event.preventDefault()
    if (event.repeat && command === 'leave') return
    if (command === 'leave') link.leave()
    else link.step(command)
  }
  window.addEventListener('keydown', press, true)
  return () => window.removeEventListener('keydown', press, true)
}

/**
 * The presenter window at `/p/:project/:page/presenter`, drawing the slide now
 * at its step, the next slide, the notes, a timer, and the clock from what the
 * audience sends, and sending its presses back.
 */
export function PresenterScreen({
  id,
  read = Date.now,
}: {
  /** The presentation the window's address names, null when it names none. */
  id: string | null
  read?: () => number
}) {
  const phase = useAudience(id)
  const state = phase.kind === 'presenting' ? phase.state : undefined
  useAudienceThemes(state?.themes)
  return (
    <div
      data-presenter
      className="fixed inset-0 z-50 flex flex-col bg-[#0c0c0d] p-5 text-[#f1f1ee]"
    >
      {state ? (
        <Presenter state={state} read={read} />
      ) : (
        <p
          role="status"
          className="m-auto max-w-[420px] text-center text-[15px] leading-[1.5] text-[#a4a6ab]"
        >
          {phase.kind === 'waiting'
            ? 'Waiting for the presenting tab.'
            : 'Presenting ended. Close this window, or present again from the board.'}
        </p>
      )}
    </div>
  )
}

function Presenter({
  state,
  read,
}: {
  state: PresentedState
  read: () => number
}) {
  const page = useLive((live) =>
    live.board?.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === state.page),
  )
  const step = usePresent((present) =>
    Math.min(
      present.step === 'last' ? present.steps : present.step,
      present.steps,
    ),
  )
  const steps = usePresent((present) => present.steps)
  const order = page ? presentOrder(page.frames, state.frame) : []
  const at = order.findIndex((frame) => frame.ref === state.frame)
  const now = order[at]
  const next = at === -1 ? undefined : order[at + 1]
  return (
    <>
      <header className="grid grid-cols-[1fr_auto_1fr] items-center pb-4 text-[14px] text-[#a4a6ab] tabular-nums">
        <span>
          {now
            ? `Slide ${at + 1} of ${order.length}`
            : 'Slide not on the board'}
          {steps > 0 ? ` · step ${step} of ${steps}` : ''}
        </span>
        <Timer startedAt={state.startedAt} read={read} />
        <Clock read={read} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1.55fr_1fr] gap-5">
        <section
          aria-labelledby="presenter-now"
          className="flex min-h-0 flex-col"
        >
          <Label id="presenter-now">Now</Label>
          <SlideBox frame={now} walk="live" />
          <StepDots step={step} steps={steps} />
        </section>
        <section
          aria-labelledby="presenter-next"
          className="flex min-h-0 flex-col"
        >
          <Label id="presenter-next">Next</Label>
          <div className="flex h-[42%] shrink-0 flex-col">
            <SlideBox frame={next} walk="first" endLike={now} />
          </div>
          <Notes text={now?.speakerNotes} />
        </section>
      </div>
    </>
  )
}

function Label({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="pb-2 text-[12px] font-normal text-[#8c8f95]">
      {children}
    </h2>
  )
}

/**
 * One slide fit to its box, which takes no focus or key, so a press always
 * reaches the presenter window rather than the frame's own document.
 */
function SlideBox({
  frame,
  walk,
  endLike,
}: {
  frame: FrameRecord | undefined
  walk: StepWalk
  /** With no `frame`, draws End of deck at the size this frame would take, so the layout holds still. */
  endLike?: FrameRecord
}) {
  const box = useRef<HTMLDivElement>(null)
  const room = useRoom(box)
  return (
    <div
      ref={box}
      inert
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
    >
      {frame ? (
        <ScaledFrame
          key={frame.ref}
          frame={frame}
          room={room}
          walk={walk}
          keys={false}
          held={false}
        />
      ) : endLike ? (
        <EndOfDeck like={endLike} room={room} />
      ) : null}
    </div>
  )
}

function EndOfDeck({
  like,
  room,
}: {
  like: FrameRecord
  room: { width: number; height: number }
}) {
  const { width, height } = shownBox(like)
  const body = bezelBox({ x: 0, y: 0, width, height }, like.device)
  const scale = presentScale(like, room)
  return (
    <div
      data-end-of-deck
      className="absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[8px] bg-[#19191b] text-[14px] text-[#8c8f95]"
      style={{ width: body.width * scale, height: body.height * scale }}
    >
      End of deck
    </div>
  )
}

/** Past this many, dots stop being countable at their size, as the bar's do. */
const MOST_DOTS = 12

function StepDots({ step, steps }: { step: number; steps: number }) {
  if (steps === 0) return <div aria-hidden className="h-[22px]" />
  return (
    <div
      role="img"
      aria-label={`Step ${step} of ${steps}`}
      className="flex h-[22px] items-end gap-1.5"
    >
      {steps > MOST_DOTS ? (
        <span aria-hidden className="text-[13px] text-[#a4a6ab] tabular-nums">
          {step}/{steps}
        </span>
      ) : (
        Array.from({ length: steps }, (_, index) => index + 1).map((number) => (
          <span
            key={number}
            aria-hidden
            data-filled={number <= step || undefined}
            className="size-2 rounded-full bg-[#3a3b3f] data-filled:bg-[#f1f1ee]"
          />
        ))
      )}
    </div>
  )
}

function Notes({ text }: { text: string | undefined }) {
  const note = text?.trim()
  return (
    <section
      aria-label="Speaker notes"
      data-notes
      tabIndex={0}
      className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-[8px] bg-[#19191b] p-4 text-[17px] leading-[1.55] whitespace-pre-wrap text-[#e6e6e2] outline-none focus-visible:ring-3 focus-visible:ring-[#4e92f6]"
    >
      {note ? (
        note
      ) : (
        <span className="text-[#8c8f95]">No speaker note on this slide.</span>
      )}
    </section>
  )
}

/** The time since presenting began, a press resetting it to zero in this window alone. */
function Timer({ startedAt, read }: { startedAt: number; read: () => number }) {
  const now = useNow(read)
  const [resetAt, setResetAt] = useState<number | null>(null)
  const since = Math.max(startedAt, resetAt ?? startedAt)
  return (
    <button
      type="button"
      onClick={() => setResetAt(read())}
      className="justify-self-center rounded-[6px] px-2 font-mono text-[28px] font-semibold tracking-[-0.01em] text-[#f1f1ee] tabular-nums outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-[#4e92f6]"
    >
      {formatElapsed(now - since)}
      <span className="sr-only">, reset the timer</span>
    </button>
  )
}

function Clock({ read }: { read: () => number }) {
  const now = useNow(read)
  return (
    <time className="justify-self-end" dateTime={new Date(now).toISOString()}>
      {formatClock(now)}
    </time>
  )
}
