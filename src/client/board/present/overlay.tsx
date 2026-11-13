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
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, setFrameTheme } from '@/shared/theme'

import { PRESENT } from '../chrome/toolbar-tools'
import { PresentBar } from './bar'
import { fitScale } from './fit'
import {
  leavePresenting,
  presentOrder,
  stepPresenting,
  usePresent,
} from './store'

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
 * gone or was the body. The opener is read during the first render, since
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
      back?.focus()
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
  return createPortal(
    <Presenting key={pageRef} frame={frame} at={at + 1} count={order.length} />,
    document.body,
  )
}

interface PresentingProps {
  /** Undefined once the page or the frame is gone, which leaves. */
  frame: FrameRecord | undefined
  at: number
  count: number
}

function Presenting({ frame, at, count }: PresentingProps) {
  const layer = useRef<HTMLDivElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
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

  // Each load is a new document, so the keys and the pointer bind into it again.
  useEffect(() => {
    const element = iframe.current
    if (!element) return
    let unbind = () => {}
    const bind = () => {
      unbind()
      const target = element.contentWindow
      if (!target) return
      const untake = takeKeys(target, true)
      target.addEventListener('pointermove', wake)
      unbind = () => {
        untake()
        target.removeEventListener('pointermove', wake)
      }
    }
    bind()
    element.addEventListener('load', bind)
    return () => {
      element.removeEventListener('load', bind)
      unbind()
    }
  }, [frame?.ref, wake])

  if (!frame) return null
  const scale = fitScale(frame.box, room)
  return (
    <div
      ref={layer}
      role="dialog"
      aria-modal
      aria-label={`Presenting ${frame.name}, ${at} of ${count}`}
      tabIndex={-1}
      data-presenting
      onPointerMove={wake}
      className="fixed inset-0 z-50 overflow-hidden bg-black outline-none"
    >
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: frame.box.width,
          height: frame.box.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <PresentedFrame key={frame.ref} frame={frame} iframe={iframe} />
      </div>
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

/**
 * One frame's live page through the same `/frames/` address the canvas
 * loads, in the theme the frame shows on the board, never a capture.
 */
function PresentedFrame({
  frame,
  iframe,
}: {
  frame: { ref: string; name: string }
  iframe: RefObject<HTMLIFrameElement | null>
}) {
  const theme = useFrameTheme(frame.ref)
  const version = useLive((state) => state.reloads[frame.ref] ?? 0)
  // The theme is read when the page loads or reloads, and a later flip
  // rewrites the root below rather than restarting the page.
  const src = useMemo(
    () => frameThemeUrl(frame.ref, frameTheme(frame.ref), version),
    [frame.ref, version],
  )
  useEffect(() => {
    const element = iframe.current
    if (!element) return
    const write = () => {
      const root = element.contentDocument?.documentElement
      if (root) setFrameTheme(root, theme)
    }
    write()
    element.addEventListener('load', write)
    return () => element.removeEventListener('load', write)
  }, [iframe, theme])
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
