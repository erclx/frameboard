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
import { bezelBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, setFrameTheme } from '@/shared/theme'

import { focusWithoutTooltip } from '../chrome/quiet-focus'
import { PRESENT } from '../chrome/toolbar-tools'
import { Bezel } from '../device/bezel'
import { PresentBar } from './bar'
import { fitScale } from './fit'
import {
  endTransition,
  leavePresenting,
  presentOrder,
  stepPresenting,
  usePresent,
} from './store'
import { TransitionKeyframes, TransitionLayer } from './transition'
import { CUT, type Travel } from './travel'

/** The actions a press reaches while presenting, every other key stopping short of the board. */
const PRESENT_KEYS = [
  'present.next',
  'present.previous',
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
 * Takes every key press in `target` ahead of the board. A press one of the
 * present actions binds runs it, and anything else stops before the board's
 * keys, so the palette and the canvas tools stay shut while presenting. In a
 * frame's own window only the present keys are taken, so the slide keeps the
 * rest.
 */
function takeKeys(target: Window, frame: boolean): () => void {
  const press = (event: KeyboardEvent) => {
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
 * Returns focus on leave to whatever held it when presenting began, as a
 * dialog does, or to the toolbar's Present page button when that element is
 * gone or was the body, opening no tooltip over the board. The opener is read during the first render, since
 * `useInertBehind` blurs it before any effect runs, and this is called after
 * `useInertBehind` so its cleanup runs once the board is no longer inert.
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
 * screen was on, so a refused request never ends what it started.
 */
function useLeaveWithFullscreen(): void {
  useEffect(() => {
    let on = document.fullscreenElement !== null
    const change = () => {
      if (document.fullscreenElement) on = true
      else if (on) leavePresenting()
    }
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
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
 * The presented page, one frame at a time over the whole window, drawn on
 * black and scaled to fit. Mounted by the board screen and rendering nothing
 * until a page presents.
 */
export function PresentOverlay() {
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
      frame={frame}
      leaving={left && leaving ? { ...leaving, frame: left } : null}
      at={at + 1}
      count={order.length}
    />,
    document.body,
  )
}

interface PresentingProps {
  /** Undefined once the page or the frame is gone, which leaves. */
  frame: FrameRecord | undefined
  /** The frame a step left, drawn under `frame` while its transition plays. */
  leaving: { frame: FrameRecord; travel: Travel; id: number } | null
  at: number
  count: number
}

function Presenting({ frame, leaving, at, count }: PresentingProps) {
  const layer = useRef<HTMLDivElement>(null)
  const room = useRoom(layer)
  const { shown, wake } = useBarWake()
  useLeaveWithFullscreen()
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
  // Keyed by frame, so a frame turning from arriving to leaving keeps its document.
  const layers = [
    ...(leaving && leaving.frame.ref !== frame.ref
      ? [{ frame: leaving.frame, role: 'leave' as const }]
      : []),
    { frame, role: 'enter' as const },
  ]
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
      <TransitionKeyframes />
      {layers.map(({ frame: drawn, role }) => (
        <TransitionLayer key={drawn.ref} role={role} travel={travel}>
          <ScaledFrame
            frame={drawn}
            room={room}
            live={role === 'enter'}
            held={role === 'enter' && leaving !== null}
            wake={wake}
          />
        </TransitionLayer>
      ))}
      <PresentBar
        shown={shown}
        at={at}
        count={count}
        name={frame.name}
        onPrevious={() => stepPresenting(-1)}
        onNext={() => stepPresenting(1)}
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
  // A frame in a device fits with its body, which draws past its box.
  const scale = fitScale(bezelBox(frame.box, frame.device), room)
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        width: frame.box.width,
        height: frame.box.height,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      <PresentedFrame frame={frame} {...live} />
      {frame.device ? <Bezel device={frame.device} /> : null}
    </div>
  )
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

/**
 * One frame's live page through the same `/frames/` address the canvas
 * loads, in the theme the frame shows on the board, never a capture.
 */
function PresentedFrame({
  frame,
  live,
  held,
  wake,
}: { frame: { ref: string; name: string } } & LiveProps) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const theme = useFrameTheme(frame.ref)
  const version = useLive((state) => state.reloads[frame.ref] ?? 0)
  // The theme is read when the page loads or reloads, and a later flip
  // rewrites the root below rather than restarting the page.
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
    <iframe
      ref={iframe}
      title={frame.name}
      src={src}
      style={{ colorScheme: theme }}
      className="block size-full border-0 bg-[color:Canvas]"
    />
  )
}
