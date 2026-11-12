import { type RefObject, useEffect, useState } from 'react'

import { holdMotionIn, type Motion, readMotionIn } from '@/shared/motion'

import {
  advanceMotion,
  type MotionHold,
  motionHoldOf,
  onMotionHoldChange,
  releaseMotion,
} from './store'

/** How long a frame's script has to register a timeline after it loads, as capture allows. */
export const MOTION_TIMEOUT_MS = 10_000

/** A live frame's timeline and the length in ms its track spans. */
export interface FrameMotion {
  motion: Motion
  /**
   * The timeline's end, or for one that repeats forever its longest single
   * iteration, so a spinner still scrubs within one turn.
   */
  span: number
}

/**
 * Reads the timeline a live frame's window runs, in the frame's own realm,
 * or null when none registers within `timeoutMs`.
 */
export async function readFrameMotion(
  view: Window,
  timeoutMs = MOTION_TIMEOUT_MS,
): Promise<FrameMotion | null> {
  const motion = await readMotionIn(view, timeoutMs)
  if (motion === null) return null
  return { motion, span: motion.duration ?? longestIteration(view) }
}

// Only CSS and Web Animations report no end, since `__hf` and GSAP give a
// finite duration, so the iteration is read off the page's animations.
function longestIteration(view: Window): number {
  const lengths = view.document.getAnimations().map((animation) => {
    const timing = animation.effect?.getComputedTiming()
    const duration = Number(timing?.duration)
    const delay = timing?.delay ?? 0
    return Number.isFinite(duration) ? delay + duration : 0
  })
  return Math.round(Math.max(0, ...lengths))
}

/**
 * A seek that keeps only the latest moment asked for: while one seek runs,
 * each newer ask replaces the waiting one, so a drag over a slow `__hf.seek`
 * catches up rather than queuing every position it passed.
 */
export function createSeeker(
  view: Window,
  motion: Motion,
): (ms: number) => Promise<void> {
  let waiting: number | null = null
  let running: Promise<void> | null = null

  const drain = async () => {
    while (waiting !== null) {
      const ms = waiting
      waiting = null
      await holdMotionIn(view, { motion, ms })
    }
    running = null
  }

  return (ms) => {
    waiting = ms
    running ??= drain()
    return running
  }
}

/**
 * Hands a page the board held back to its own clock. CSS and Web Animations
 * play on from where they stand. A script timeline the board paused has no
 * play the contract names, so the page loads again from its start.
 */
export function releaseIn(view: Window, motion: Motion): void {
  if (motion.source === 'css') {
    for (const animation of view.document.getAnimations()) animation.play()
    return
  }
  view.location.reload()
}

/**
 * The selected frame's timeline as its live page runs it, read again each
 * time the frame loads or swaps its page for a placeholder. Undefined while
 * a read is pending, null for a frame with nothing to seek or not on the
 * canvas.
 */
export function useFrameMotion(ref: string): FrameMotion | null | undefined {
  const [read, setRead] = useState<{
    ref: string
    motion: FrameMotion | null
  } | null>(null)
  useEffect(() => {
    const host = document.querySelector(`[data-frame="${CSS.escape(ref)}"]`)
    let current = 0
    const resolve = () => {
      const asked = (current += 1)
      const view =
        host?.querySelector<HTMLIFrameElement>(':scope > iframe')?.contentWindow
      if (!view) {
        setRead({ ref, motion: null })
        return
      }
      setRead(null)
      void readFrameMotion(view).then(
        (motion) => {
          if (asked === current) setRead({ ref, motion })
        },
        () => {
          if (asked === current) setRead({ ref, motion: null })
        },
      )
    }
    resolve()
    if (!host) return
    // A load does not bubble, so it is caught on the way down, and the swap
    // to a placeholder is the box's own child list changing.
    const swaps = new MutationObserver(resolve)
    swaps.observe(host, { childList: true })
    host.addEventListener('load', resolve, true)
    return () => {
      current += 1
      swaps.disconnect()
      host.removeEventListener('load', resolve, true)
    }
  }, [ref])
  if (read === null || read.ref !== ref) return undefined
  return read.motion
}

/**
 * Drives one frame's live page from the motion store: seeks it to the held
 * moment, runs the play clock looping at the track's end, re-seeks after an
 * agent's write reloads it, and hands it back to its own clock once its hold
 * ends. Entering Play and leaving the page both end the hold.
 */
export function useMotionDriver(
  iframe: RefObject<HTMLIFrameElement | null>,
  ref: string,
  live: boolean,
  playing: boolean,
): void {
  useEffect(() => {
    if (playing) releaseMotion(ref)
  }, [playing, ref])

  // A frame leaves the canvas on a page switch, so the hold goes with it.
  useEffect(() => () => releaseMotion(ref), [ref])

  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    let bound: {
      view: Window
      found: FrameMotion
      seek: (ms: number) => Promise<void>
    } | null = null
    // Each load is a new generation. A read started for an older one is
    // dropped, and may never settle, since a discarded document runs no
    // animation frames, so it never blocks the bind of the page now shown.
    let generation = 0
    let bindingFor: number | null = null
    // Whether this document has been seeked, so a release touches only a page the board moved.
    let driven = false
    let clock: { from: number; started: number; frame: number } | null = null
    let disposed = false

    const stopClock = () => {
      if (clock) element.contentWindow?.cancelAnimationFrame(clock.frame)
      clock = null
    }

    const tick = (now: number) => {
      if (!clock || !bound) return
      const { span } = bound.found
      const elapsed = clock.from + (now - clock.started)
      advanceMotion(ref, span > 0 ? elapsed % span : elapsed)
      clock.frame = bound.view.requestAnimationFrame(tick)
    }

    const startClock = (hold: MotionHold) => {
      if (clock || !bound) return
      // Play at the end starts over, as the loop does.
      const from = hold.at >= bound.found.span ? 0 : hold.at
      const started = bound.view.performance.now()
      clock = { from, started, frame: bound.view.requestAnimationFrame(tick) }
    }

    const apply = () => {
      if (disposed) return
      const hold = motionHoldOf(ref)
      if (!hold) {
        stopClock()
        if (driven && bound) releaseIn(bound.view, bound.found.motion)
        driven = false
        return
      }
      if (!bound) {
        void bind()
        return
      }
      driven = true
      void bound.seek(hold.at)
      if (hold.playing) startClock(hold)
      else stopClock()
    }

    const bind = async () => {
      const view = element.contentWindow
      const asked = generation
      if (bindingFor === asked || !view) return
      bindingFor = asked
      const found = await readFrameMotion(view).catch(() => null)
      if (bindingFor === asked) bindingFor = null
      if (disposed || asked !== generation || !found) return
      bound = { view, found, seek: createSeeker(view, found.motion) }
      apply()
    }

    // An agent's write reloads the page, so the hold binds the new document
    // and lands on the same moment.
    const reload = () => {
      generation += 1
      stopClock()
      bound = null
      driven = false
      if (motionHoldOf(ref)) void bind()
    }

    let last = motionHoldOf(ref)
    const stop = onMotionHoldChange(() => {
      const next = motionHoldOf(ref)
      if (next === last) return
      last = next
      apply()
    })
    element.addEventListener('load', reload)
    if (last) void bind()
    return () => {
      disposed = true
      stop()
      stopClock()
      element.removeEventListener('load', reload)
    }
  }, [iframe, ref, live])
}

/**
 * The moment a free-running frame shows now, so pausing it holds where it
 * stood. CSS reads its animations' clock and GSAP its `time()`. `__hf`
 * exposes no reading, so a HyperFrames page pauses at its start.
 */
export function liveMomentOf(ref: string, found: FrameMotion): number {
  const frame = document.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] > iframe`,
  )?.contentWindow
  if (!frame) return 0
  const { motion, span } = found
  let at = 0
  if (motion.source === 'css') {
    const times = frame.document
      .getAnimations()
      .map((animation) => Number(animation.currentTime))
      .filter((time) => Number.isFinite(time))
    at = Math.max(0, ...times)
  } else if (motion.source === 'timelines') {
    const registry = (
      frame as unknown as { __timelines?: Record<string, { time?: unknown }> }
    ).__timelines
    const clock = Object.values(registry ?? {}).find(
      (timeline) => typeof timeline?.time === 'function',
    )
    const seconds = clock
      ? Number((clock.time as () => unknown).call(clock))
      : 0
    at = Number.isFinite(seconds) ? seconds * 1000 : 0
  }
  if (span <= 0) return Math.round(at)
  return Math.round(motion.duration === null ? at % span : Math.min(at, span))
}
