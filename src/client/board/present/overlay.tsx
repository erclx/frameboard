import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { type Action, findAction, isEnabled } from '@/client/actions/registry'
import {
  FRAME_ALLOW,
  framePageUrl,
  useFramePort,
} from '@/client/live/frame-url'
import { useLive } from '@/client/live/store'
import { frameTheme, useFrameTheme } from '@/client/theme/store'
import {
  bezelBox,
  insetsPage,
  pageCorners,
  screenCorners,
  shownBox,
  sideInset,
  topInset,
  turnsWith,
} from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request, subscribe } from '../bridge/channel'
import { followPage } from '../bridge/shown'
import { focusWithoutTooltip } from '../chrome/quiet-focus'
import { PRESENT } from '../chrome/toolbar-tools'
import { Bezel } from '../device/bezel'
import { usePageColors } from '../device/page-colors'
import { rotateFrame, turnRefusal } from '../device/turn'
import { useWaitingOnFirstLoad } from '../frame-loading'
import { useThemeInFrame } from '../frame-theme'
import { useHiddenScrollbar } from '../hidden-scrollbar'
import { LoadingBlock } from '../loading-block'
import { PresentBar } from './bar'
import { presentScale } from './fit'
import { Overview } from './overview'
import {
  fetchOwnTransitions,
  type LoadTransitions,
  useOwnKeyframes,
} from './own-transitions'
import { useRoom } from './room'
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

/** The present action a press names, by its key or its code. */
function presentActionOf(event: KeyboardEvent): Action | undefined {
  return PRESENT_KEYS.map((id) => findAction(id)).find((candidate) =>
    candidate?.keys?.some((binding) => bindingMatches(binding, event)),
  )
}

/** Takes every key ahead of the board while presenting, leaving a frame's own window to `bindPresentKeys`. */
function takeKeys(): () => void {
  const press = (event: KeyboardEvent) => {
    // The open grid takes its own keys, and every other place stays deaf to them.
    if (overviewOpen()) {
      if (!inOverview(event.target)) event.stopPropagation()
      return
    }
    // Space and Enter press a focused bar button, which a step would cancel.
    if (pressesButton(event)) return
    const action = presentActionOf(event)
    if (action && isEnabled(action)) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat || action.repeat) action.run()
      return
    }
    event.stopPropagation()
  }
  window.addEventListener('keydown', press, true)
  return () => window.removeEventListener('keydown', press, true)
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
 * Leaves presenting when the browser leaves a full screen that was on, since Esc
 * goes to the browser, unless the presenter window is open, whose opening takes
 * this tab out of full screen in every engine. Answers whether full screen is on.
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
  const canWrite = useLive((state) => state.canWrite)
  const { shown, wake } = useBarWake()
  const fullscreen = useLeaveWithFullscreen()
  useInertBehind(layer)
  useReturnFocus()

  useEffect(() => takeKeys(), [])
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
              walk={role === 'enter' ? 'live' : 'off'}
              keys={role === 'enter'}
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
        rotateSlot={canWrite && order.some((slide) => turnsWith(slide.device))}
        onRotate={
          canWrite && turnsWith(frame.device)
            ? () => rotateFrame(frame, { reveal: false })
            : undefined
        }
        rotateOff={turnRefusal(frame)}
      />
    </div>
  )
}

/**
 * How a presented frame walks its steps: `live` counts them into this window's
 * present store and shows the step it holds, `first` hides every one, and
 * `off` leaves the document as it stands.
 */
export type StepWalk = 'live' | 'first' | 'off'

interface LiveProps {
  walk: StepWalk
  /** Whether the frame takes the present keys and the pointer, which only the audience's arriving frame does. */
  keys: boolean
  /** Whether the frame's own animations wait, as they do while it arrives, so its clock starts once it lands. */
  held: boolean
  wake?: () => void
}

/** One frame centered in the room at the scale that fits it, inside its device when it has one. */
export function ScaledFrame({
  frame,
  room,
  ...live
}: {
  frame: FrameRecord
  room: { width: number; height: number }
} & LiveProps) {
  const { width, height } = shownBox(frame)
  const body = bezelBox({ x: 0, y: 0, width, height }, frame.device, frame.turn)
  const scale = presentScale(frame, room)
  // Centers by the body, which a laptop's reaches further below than above.
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
    </div>
  )
}

/**
 * The bindings of every present action enabled now, none while the grid is
 * open, since a binding the frame holds prevents the page's own press.
 */
function enabledPresentKeys(): string[] {
  if (overviewOpen()) return []
  return PRESENT_KEYS.flatMap((id) => {
    const action = findAction(id)
    return action && isEnabled(action) ? (action.keys ?? []) : []
  })
}

/**
 * Has a presented page take the present keys enabled now, reopened as one
 * turns on or off, ignoring the single-key switch the board's window ignores.
 */
function bindPresentKeys(iframe: HTMLIFrameElement): () => void {
  let taken = enabledPresentKeys()
  const open = () =>
    subscribe(
      iframe,
      'keys',
      { keys: taken, keepTyping: false, keepButtons: true },
      ({ key, repeat }) => {
        const action = PRESENT_KEYS.map((id) => findAction(id)).find(
          (candidate) => candidate?.keys?.includes(key),
        )
        if (!taken.includes(key) || !action || !isEnabled(action)) return
        if (!repeat || action.repeat) action.run()
      },
    )
  let held = open()
  const stop = presentStore.subscribe(() => {
    const next = enabledPresentKeys()
    if (next.join(' ') === taken.join(' ')) return
    taken = next
    held.close()
    held = open()
  })
  return () => {
    stop()
    held.close()
  }
}

/** Keeps an op's request open on each page an iframe shows, which holds what it does in the page until closed. */
function holdOnEachPage(
  iframe: HTMLIFrameElement,
  op: 'hold-animations' | 'hide-controls',
): () => void {
  return followPage(iframe, () => subscribe(iframe, op, {}, () => {}).close)
}

/** How long a loaded slide stays hidden on a bridge that never answers, the channel's own reply wait. */
const STEPS_WAIT_MS = 5000

/**
 * The step a walk opens a page at, read before its count is known: every one
 * for a frame arrived at going back, so a slide reloaded mid-walk hides only
 * what the audience has not seen.
 */
function openingStep(): number {
  const { step } = presentStore.getState()
  return step === 'last' ? Number.MAX_SAFE_INTEGER : step
}

/**
 * Walks one page's steps inside its frame, counting them into this window's
 * present store and showing the step it holds, calling `ready` once the page
 * shows the step it should, or the frame refused.
 */
function walkLive(iframe: HTMLIFrameElement, ready: () => void): () => void {
  const opening = openingStep()
  let revealed = opening
  /** The group the last press revealed, which a reread keeps entering. */
  let entering: number | null = null
  let replied = false
  let counting = false

  const show = () =>
    request(iframe, 'steps-show', { steps: walk.id, shown: revealed, entering })

  // Counting can resolve a step back onto this frame, which plays no entrance.
  const recount = (count: number): boolean => {
    counting = true
    countSteps(count)
    counting = false
    const shown = shownStep()
    if (entering !== shown - 1) entering = null
    const moved = shown !== revealed
    revealed = shown
    return moved
  }

  const walk = subscribe(iframe, 'steps', { shown: opening }, (count) => {
    if (replied && recount(count)) void show()
  })
  void walk.opened.then(async (count) => {
    if (count !== null) {
      replied = true
      if (recount(count)) await show()
    }
    ready()
  })
  const stop = presentStore.subscribe(() => {
    if (!replied || counting) return
    const shown = shownStep()
    if (shown === revealed) return
    entering = shown > revealed ? shown - 1 : null
    revealed = shown
    void show()
  })
  return () => {
    stop()
    walk.close()
  }
}

/**
 * Walks a frame's steps as `walk` says on each page it shows. Answers whether
 * the page shows its steps yet, since an iframe's first page is blank and a
 * stepped slide must not flash whole, or the reply wait passed since it loaded.
 */
function useStepWalk(
  iframe: RefObject<HTMLIFrameElement | null>,
  walk: StepWalk,
): boolean {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const element = iframe.current
    if (walk === 'off' || !element) return
    const ready = () => setLoaded(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = () => {
      clearTimeout(timer)
      timer = setTimeout(ready, STEPS_WAIT_MS)
    }
    element.addEventListener('load', waited)
    const stop = followPage(element, () => {
      if (walk === 'live') return walkLive(element, ready)
      const hidden = subscribe(element, 'steps', { shown: 0 }, () => {})
      void hidden.opened.then(ready)
      return hidden.close
    })
    return () => {
      stop()
      clearTimeout(timer)
      element.removeEventListener('load', waited)
    }
  }, [iframe, walk])

  return loaded
}

/**
 * One frame's live page through the same frame-port address the canvas
 * loads, in the theme the frame shows on the board, never a capture, inside
 * its device with the page inset as the board insets it.
 */
function PresentedFrame({
  frame,
  walk,
  keys,
  held,
  wake,
}: {
  frame: Pick<
    FrameRecord,
    | 'ref'
    | 'name'
    | 'box'
    | 'scroll'
    | 'hugHeight'
    | 'device'
    | 'pose'
    | 'island'
    | 'turn'
  >
} & LiveProps) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const shown = shownBox(frame)
  // A page-tall phone shown one screen tall scrolls with no bar, as a scroll frame does on the board.
  useHiddenScrollbar(iframe, true, shown.height < frame.box.height)
  // The screen rounds under its bezel, whose body cannot cover a square corner.
  const corners = frame.device ? screenCorners(frame.device) : undefined
  const statusBar = topInset(frame.device, frame.turn)
  const side = sideInset(frame.device, frame.turn)
  const page = frame.device
    ? {
        borderRadius: pageCorners(frame.device, frame.turn),
        ...(statusBar
          ? { marginTop: statusBar, height: `calc(100% - ${statusBar}px)` }
          : {}),
        ...(side
          ? { marginLeft: side, width: `calc(100% - ${2 * side}px)` }
          : {}),
      }
    : {}
  const loaded = useStepWalk(iframe, walk)
  // The iframe stays mounted across slides, so only its first page waits.
  const waiting = useWaitingOnFirstLoad(iframe, true)
  const theme = useFrameTheme(frame.ref)
  // Sent ahead of the colors, which a flip asks for in the theme it sends.
  useThemeInFrame(iframe, theme)
  const colors = usePageColors(
    iframe,
    insetsPage(frame.device, frame.turn),
    theme,
  )
  const version = useLive((state) => state.reloads[frame.ref] ?? 0)
  // Read at load, since a later flip rewrites the root rather than restart the page.
  const framePort = useFramePort()
  const src = useMemo(
    () => framePageUrl(framePort, frame.ref, frameTheme(frame.ref), version),
    [frame.ref, version, framePort],
  )
  useEffect(() => {
    const element = iframe.current
    if (!element || !held) return
    return holdOnEachPage(element, 'hold-animations')
  }, [held])
  useEffect(() => {
    const element = iframe.current
    if (!element) return
    return holdOnEachPage(element, 'hide-controls')
  }, [])
  useEffect(() => {
    const element = iframe.current
    if (!element || !keys) return
    return followPage(element, () => bindPresentKeys(element))
  }, [keys])
  useEffect(() => {
    const element = iframe.current
    if (!element || !keys || !wake) return
    return followPage(
      element,
      () => subscribe(element, 'pointer-move', {}, () => wake()).close,
    )
  }, [keys, wake])
  return (
    <>
      <iframe
        ref={iframe}
        title={frame.name}
        src={src ?? undefined}
        allow={FRAME_ALLOW}
        aria-busy={waiting || undefined}
        style={{ colorScheme: theme, ...page }}
        // Hidden until its steps are hidden, so a stepped slide never flashes whole.
        className={`block size-full border-0 bg-[color:Canvas] ${loaded ? '' : 'invisible'}`}
      />
      {waiting ? <LoadingBlock theme={theme} corners={corners} /> : null}
      {frame.device ? (
        <Bezel
          device={frame.device}
          width={shown.width}
          height={shown.height}
          pose={frame.pose}
          island={frame.island}
          turn={frame.turn}
          colors={colors}
          theme={theme}
        />
      ) : null}
    </>
  )
}
