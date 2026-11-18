import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { findAction, isEnabled } from '@/client/actions/registry'
import { useLive } from '@/client/live/store'
import { frameTheme, useFrameTheme } from '@/client/theme/store'
import { HIDE_CONTROLS_CSS } from '@/shared/bindings'
import { bezelBox, type Device, screenCorners } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, LOOK_MARKER, setFrameTheme } from '@/shared/theme'

import { focusWithoutTooltip } from '../chrome/quiet-focus'
import { PRESENT } from '../chrome/toolbar-tools'
import { Bezel } from '../device/bezel'
import { useWaitingOnFirstLoad } from '../frame-loading'
import { LoadingBlock } from '../loading-block'
import { PresentBar } from './bar'
import { fitScale } from './fit'
import { Overview } from './overview'
import {
  fetchOwnTransitions,
  type LoadTransitions,
  useOwnKeyframes,
} from './own-transitions'
import { readSteps, showSteps, type StepGroup, touchesSteps } from './steps'
import {
  countSteps,
  endTransition,
  jumpPresenting,
  leavePresenting,
  openPresenter,
  overviewOpen,
  presenterOpen,
  presentOrder,
  presentStore,
  shownStep,
  stepPresenting,
  toggleFullscreen,
  toggleOverview,
  usePresent,
} from './store'
import { TransitionKeyframes, TransitionLayer } from './transition'
import { CUT, type Travel } from './travel'

/** The actions a press reaches while presenting, every other key stopping short of the board. */
const PRESENT_KEYS = [
  'present.next',
  'present.previous',
  'present.overview',
  'present.fullscreen',
  'present.leave',
] as const

/** Whether a tinykeys binding such as `Shift+Space` names this press, read by its key or its code. */
function bindingMatches(binding: string, event: KeyboardEvent): boolean {
  const parts = binding.split('+')
  const key = parts.at(-1)
  const shift = parts.includes('Shift')
  return (
    (event.key === key || event.code === key) &&
    event.shiftKey === shift &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  )
}

/**
 * Takes every key ahead of the board while presenting, except in a frame's own
 * window, where only the present keys are taken.
 */
function takeKeys(target: Window, frame: boolean): () => void {
  const press = (event: KeyboardEvent) => {
    // The open grid takes its own keys, and every other place stays deaf to them.
    if (overviewOpen()) {
      if (!frame && !inOverview(event.target)) event.stopPropagation()
      return
    }
    // Space and Enter press a focused bar button, which a step would cancel.
    if (pressesButton(event)) return
    const action = PRESENT_KEYS.map((id) => findAction(id)).find((candidate) =>
      candidate?.keys?.some((binding) => bindingMatches(binding, event)),
    )
    if (action && isEnabled(action)) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat || action.repeat) action.run()
      return
    }
    if (!frame) event.stopPropagation()
  }
  target.addEventListener('keydown', press, true)
  return () => target.removeEventListener('keydown', press, true)
}

function inOverview(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-overview]') !== null
}

function pressesButton(event: KeyboardEvent): boolean {
  return (
    (event.code === 'Space' || event.key === 'Enter') &&
    event.target instanceof Element &&
    event.target.closest('button') !== null
  )
}

/**
 * Makes every other part of the page inert while presenting, so Tab never
 * leaves the overlay for the board behind it and a press there runs nothing.
 */
function useInertBehind(layer: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const own = layer.current
    if (!own) return
    const behind = [...document.body.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !child.contains(own) && !child.inert,
    )
    for (const element of behind) element.inert = true
    return () => {
      for (const element of behind) element.inert = false
    }
  }, [layer])
}

/**
 * Returns focus on leave to its opener, read in the first render since
 * `useInertBehind` blurs it before any effect, and called after it so cleanup
 * runs once the board is no longer inert.
 */
function useReturnFocus(): void {
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      const back =
        opener instanceof HTMLElement &&
        opener.isConnected &&
        opener !== document.body
          ? opener
          : document.querySelector<HTMLElement>(
              `button[aria-label="${PRESENT.label}"]`,
            )
      if (back) focusWithoutTooltip(back)
    },
    [opener],
  )
}

/** How long the pointer rests before the bar fades out. */
const BAR_REST_MS = 2000

/**
 * Whether the bar shows, and the call that shows it for another
 * `BAR_REST_MS`. It opens hidden, so a presented frame starts clean.
 */
function useBarWake(): { shown: boolean; wake: () => void } {
  const [shown, setShown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wake = useCallback(() => {
    setShown(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(false), BAR_REST_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { shown, wake }
}

/**
 * Leaves presenting when the browser leaves full screen, which spends Esc
 * on itself and fires `fullscreenchange` in its place. It waits until full
 * screen was on, so a refused request never ends what it started, and stays
 * while the presenter window is open, since opening one takes this tab out of
 * full screen in every engine. Answers whether full screen is on.
 */
function useLeaveWithFullscreen(): boolean {
  const [full, setFull] = useState(() => document.fullscreenElement !== null)
  useEffect(() => {
    let on = document.fullscreenElement !== null
    const change = () => {
      setFull(document.fullscreenElement !== null)
      if (document.fullscreenElement) on = true
      else if (on && !presenterOpen()) leavePresenting()
    }
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  return full
}

/** The overlay's size, read before paint and on every resize. */
function useRoom(element: RefObject<HTMLElement | null>) {
  const [room, setRoom] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  useLayoutEffect(() => {
    const target = element.current
    if (!target) return
    const read = () =>
      setRoom({ width: target.clientWidth, height: target.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(target)
    return () => observer.disconnect()
  }, [element])
  return room
}

/**
 * The presented page, one frame at a time over the window, rendering nothing
 * until a page presents.
 */
export function PresentOverlay({
  loadTransitions = fetchOwnTransitions,
  askThumbnails = fetch,
}: {
  loadTransitions?: LoadTransitions
  /** The request the overview asks for its thumbnails through. */
  askThumbnails?: typeof fetch
}) {
  const pageRef = usePresent((state) => state.page)
  const frameRef = usePresent((state) => state.frame)
  const leaving = usePresent((state) => state.leaving)
  const page = useLive((state) =>
    pageRef === null
      ? undefined
      : state.board?.projects
          .flatMap((project) => project.pages)
          .find((candidate) => candidate.ref === pageRef),
  )
  if (pageRef === null || frameRef === null) return null
  const order = page ? presentOrder(page.frames, frameRef) : []
  const at = order.findIndex((frame) => frame.ref === frameRef)
  const frame = order[at]
  const left = leaving
    ? page?.frames.find((candidate) => candidate.ref === leaving.ref)
    : undefined
  return createPortal(
    <Presenting
      key={pageRef}
      page={pageRef}
      order={order}
      frame={frame}
      leaving={left && leaving ? { ...leaving, frame: left } : null}
      at={at + 1}
      count={order.length}
      loadTransitions={loadTransitions}
      askThumbnails={askThumbnails}
    />,
    document.body,
  )
}

interface PresentingProps {
  page: string
  /** The slides in presenting order, which the overview draws. */
  order: readonly FrameRecord[]
  /** Undefined once the page or the frame is gone, which leaves. */
  frame: FrameRecord | undefined
  /** The frame a step left, drawn under `frame` while its transition plays. */
  leaving: { frame: FrameRecord; travel: Travel; id: number } | null
  at: number
  count: number
  loadTransitions: LoadTransitions
  askThumbnails: typeof fetch
}

function Presenting({
  page,
  order,
  frame,
  leaving,
  at,
  count,
  loadTransitions,
  askThumbnails,
}: PresentingProps) {
  const layer = useRef<HTMLDivElement>(null)
  const project = frame?.project
  const ownNames = useLive(
    (state) =>
      state.board?.projects
        .find((candidate) => candidate.name === project)
        ?.transitions.join(',') ?? '',
  )
  const ownKeyframes = useOwnKeyframes(project, ownNames, loadTransitions)
  const step = usePresent((state) =>
    state.step === 'last' ? state.steps : Math.min(state.step, state.steps),
  )
  const steps = usePresent((state) => state.steps)
  const overview = usePresent((state) => state.overview)
  const blocked = usePresent((state) => state.blocked)
  const room = useRoom(layer)
  const { shown, wake } = useBarWake()
  const fullscreen = useLeaveWithFullscreen()
  useInertBehind(layer)
  useReturnFocus()

  useEffect(() => takeKeys(window, false), [])
  useEffect(() => {
    if (!frame) leavePresenting()
  }, [frame])
  useEffect(() => {
    layer.current?.focus()
  }, [])

  const leavingId = leaving?.id
  const leavingMs = leaving?.travel.transition.ms ?? 0
  useEffect(() => {
    if (leavingId === undefined) return
    const timer = setTimeout(() => endTransition(leavingId), leavingMs)
    return () => clearTimeout(timer)
  }, [leavingId, leavingMs])

  if (!frame) return null
  const travel = leaving?.travel ?? CUT
  // Ordered by ref rather than role, since a moved iframe would load again.
  const layers = [
    ...(leaving && leaving.frame.ref !== frame.ref
      ? [{ frame: leaving.frame, role: 'leave' as const }]
      : []),
    { frame, role: 'enter' as const },
  ].sort((a, b) => (a.frame.ref < b.frame.ref ? -1 : 1))
  return (
    <div
      ref={layer}
      role="dialog"
      aria-modal
      aria-label={`Presenting ${frame.name}, ${at} of ${count}`}
      tabIndex={-1}
      data-presenting
      onPointerMove={wake}
      className="fixed inset-0 z-50 overflow-hidden bg-black outline-none perspective-[2000px]"
    >
      <TransitionKeyframes own={ownKeyframes} />
      {/* The grid covers the stage, so Tab never lands in a slide beneath it. */}
      <div className="contents" inert={overview} data-present-stage>
        {layers.map(({ frame: drawn, role }) => (
          <TransitionLayer
            key={drawn.ref}
            role={role}
            travel={travel}
            project={frame.project}
          >
            <ScaledFrame
              frame={drawn}
              room={room}
              live={role === 'enter'}
              held={role === 'enter' && leaving !== null}
              wake={wake}
            />
          </TransitionLayer>
        ))}
      </div>
      {overview ? (
        <Overview
          page={page}
          slides={order}
          current={frame.ref}
          onJump={jumpPresenting}
          onClose={toggleOverview}
          send={askThumbnails}
        />
      ) : null}
      {blocked ? (
        <p
          role="status"
          className="absolute top-6 left-1/2 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[10px] bg-[rgba(30,30,30,.82)] px-3 py-2 text-center text-body text-[#eee] backdrop-blur-[8px]"
        >
          The browser blocked the presenter view. Allow pop-ups for this
          address, then press Presenter view.
        </p>
      ) : null}
      <PresentBar
        shown={shown}
        covered={overview}
        at={at}
        count={count}
        step={step}
        steps={steps}
        name={frame.name}
        fullscreen={fullscreen}
        onPrevious={() => stepPresenting(-1)}
        onNext={() => stepPresenting(1)}
        onOverview={toggleOverview}
        onPresenter={openPresenter}
        onFullscreen={toggleFullscreen}
        onLeave={leavePresenting}
      />
    </div>
  )
}

interface LiveProps {
  /** Whether the frame is the one arriving, which alone takes the present keys and the pointer. */
  live: boolean
  /** Whether the frame's own animations wait, as they do while it arrives, so its clock starts once it lands. */
  held: boolean
  wake: () => void
}

/** One frame centered in the room at the scale that fits it, inside its device when it has one. */
function ScaledFrame({
  frame,
  room,
  ...live
}: {
  frame: FrameRecord
  room: { width: number; height: number }
} & LiveProps) {
  // Fits by the device body, which a laptop's reaches further below than above.
  const { width, height } = frame.box
  const body = bezelBox({ x: 0, y: 0, width, height }, frame.device)
  const scale = fitScale(body, room)
  const shiftX = width / 2 - (body.x + body.width / 2)
  const shiftY = height / 2 - (body.y + body.height / 2)
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        width,
        height,
        transform: `translate(-50%, -50%) scale(${scale}) translate(${shiftX}px, ${shiftY}px)`,
      }}
    >
      <PresentedFrame frame={frame} {...live} />
      {frame.device ? (
        <Bezel
          device={frame.device}
          width={width}
          height={height}
          pose={frame.pose}
        />
      ) : null}
    </div>
  )
}

/**
 * Hides every drawn control in a presented slide, which shows the design
 * alone, by one injected style, and answers its undo.
 */
function hideControls(doc: Document): () => void {
  const style = doc.createElement('style')
  style.setAttribute(LOOK_MARKER, '')
  style.textContent = HIDE_CONTROLS_CSS
  doc.head?.append(style)
  return () => style.remove()
}

const HOLD_ID = 'frameboard-present-hold'

/**
 * Pauses or resumes every CSS animation in `doc` by one injected style, which
 * reaches an animation the frame starts later too.
 */
function holdAnimations(doc: Document, held: boolean): void {
  const style = doc.getElementById(HOLD_ID)
  if (!held) {
    style?.remove()
    return
  }
  if (style) return
  const added = doc.createElement('style')
  added.id = HOLD_ID
  added.textContent =
    '*, *::before, *::after { animation-play-state: paused !important }'
  doc.head?.append(added)
}

/**
 * Runs `write` on the iframe's document now and on every load after, since
 * each load is a new document, undoing the last run before the next and on
 * the cleanup it returns.
 */
function onEachLoad(
  iframe: HTMLIFrameElement | null,
  write: (element: HTMLIFrameElement) => (() => void) | void,
): (() => void) | undefined {
  if (!iframe) return
  let undo: (() => void) | void
  const run = () => {
    undo?.()
    undo = write(iframe)
  }
  run()
  iframe.addEventListener('load', run)
  return () => {
    iframe.removeEventListener('load', run)
    undo?.()
  }
}

/** The step attributes an agent's write can change, which read the steps again. */
const STEP_KEYS = ['data-step', 'data-step-effect', 'data-step-start']

/**
 * Walks the arriving frame's steps, re-read on each load and agent change.
 * Answers whether the frame's own document loaded, since an iframe's first is blank.
 */
function useStepsWhileLive(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
): boolean {
  const [loaded, setLoaded] = useState(false)
  const read = useRef<{ doc: Document; groups: StepGroup[] } | null>(null)
  const revealed = useRef(0)
  /** The group the last press revealed, which a reread keeps entering. */
  const entering = useRef<number | null>(null)

  useEffect(() => {
    if (!live) return
    return onEachLoad(iframe.current, (element) => {
      const doc = element.contentDocument
      if (!doc || doc.URL === 'about:blank') return
      const reread = () => {
        const groups = readSteps(doc)
        // Counting can resolve a step back onto this frame, which plays no entrance.
        read.current = null
        countSteps(groups.length)
        read.current = { doc, groups }
        revealed.current = shownStep()
        if (entering.current !== revealed.current - 1) entering.current = null
        showSteps(doc, groups, revealed.current, entering.current)
      }
      entering.current = null
      reread()
      setLoaded(true)
      const view = doc.defaultView
      if (!view) return
      const observer = new view.MutationObserver((records) => {
        if (touchesSteps(records)) reread()
      })
      observer.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        attributeFilter: STEP_KEYS,
      })
      return () => observer.disconnect()
    })
  }, [iframe, live])

  useEffect(() => {
    if (!live) return
    return presentStore.subscribe(() => {
      const shown = shownStep()
      if (!read.current || shown === revealed.current) return
      entering.current = shown > revealed.current ? shown - 1 : null
      revealed.current = shown
      showSteps(read.current.doc, read.current.groups, shown, entering.current)
    })
  }, [live])

  return loaded
}

/**
 * One frame's live page through the same `/frames/` address the canvas
 * loads, in the theme the frame shows on the board, never a capture.
 */
function PresentedFrame({
  frame,
  live,
  held,
  wake,
}: {
  frame: { ref: string; name: string; device?: Device | null }
} & LiveProps) {
  const iframe = useRef<HTMLIFrameElement>(null)
  // The screen rounds under its bezel, whose body cannot cover a square corner.
  const corners = frame.device ? screenCorners(frame.device) : undefined
  const loaded = useStepsWhileLive(iframe, live)
  // The iframe stays mounted across slides, so only its first page waits.
  const waiting = useWaitingOnFirstLoad(iframe, true)
  const theme = useFrameTheme(frame.ref)
  const version = useLive((state) => state.reloads[frame.ref] ?? 0)
  // Read at load, since a later flip rewrites the root rather than restart the page.
  const src = useMemo(
    () => frameThemeUrl(frame.ref, frameTheme(frame.ref), version),
    [frame.ref, version],
  )
  useEffect(
    () =>
      onEachLoad(iframe.current, (element) => {
        const root = element.contentDocument?.documentElement
        if (root) setFrameTheme(root, theme)
      }),
    [theme],
  )
  useEffect(
    () =>
      onEachLoad(iframe.current, (element) => {
        const doc = element.contentDocument
        if (doc) holdAnimations(doc, held)
      }),
    [held],
  )
  useEffect(
    () =>
      onEachLoad(iframe.current, (element) => {
        const doc = element.contentDocument
        if (doc) return hideControls(doc)
      }),
    [],
  )
  // Only the arriving frame takes the present keys and wakes the bar.
  useEffect(
    () =>
      onEachLoad(iframe.current, (element) => {
        const target = element.contentWindow
        if (!live || !target) return
        const untake = takeKeys(target, true)
        target.addEventListener('pointermove', wake)
        return () => {
          untake()
          target.removeEventListener('pointermove', wake)
        }
      }),
    [live, wake],
  )
  return (
    <>
      <iframe
        ref={iframe}
        title={frame.name}
        src={src}
        aria-busy={waiting || undefined}
        style={{ colorScheme: theme, borderRadius: corners }}
        // Hidden until its steps are hidden, so a stepped slide never flashes whole.
        className={`block size-full border-0 bg-[color:Canvas] ${loaded ? '' : 'invisible'}`}
      />
      {waiting ? <LoadingBlock theme={theme} corners={corners} /> : null}
    </>
  )
}
