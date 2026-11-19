import type { FrameMotion } from '@/shared/frame-bridge/motion'
import { holdMotionIn, type Motion, readMotionIn } from '@/shared/motion'

import type { Handlers } from './handler'

/** How long a page's script has to register a timeline after it loads, as capture allows. */
export const MOTION_TIMEOUT_MS = 10_000

/**
 * Reads the timeline the page runs, or null when none registers within
 * `timeoutMs`.
 */
export async function readFrameMotion(
  timeoutMs = MOTION_TIMEOUT_MS,
): Promise<FrameMotion | null> {
  const motion = await readMotionIn(window, timeoutMs)
  if (motion === null) return null
  return { motion, span: motion.duration ?? longestIteration() }
}

// Only CSS and Web Animations report no end, since `__hf` and GSAP give a
// finite duration, so the iteration is read off the page's animations.
function longestIteration(): number {
  const lengths = document.getAnimations().map((animation) => {
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
export function createSeeker(motion: Motion): (ms: number) => Promise<void> {
  let waiting: number | null = null
  let running: Promise<void> | null = null

  const drain = async () => {
    while (waiting !== null) {
      const ms = waiting
      waiting = null
      await holdMotionIn(window, { motion, ms })
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
function release(motion: Motion): void {
  if (motion.source === 'css') {
    for (const animation of document.getAnimations()) animation.play()
    return
  }
  location.reload()
}

/**
 * The moment the page shows now, so pausing it holds where it stood. CSS
 * reads its animations' clock and GSAP its `time()`. `__hf` exposes no
 * reading, so a HyperFrames page pauses at its start.
 */
function momentOf({ motion, span }: FrameMotion): number {
  let at = 0
  if (motion.source === 'css') {
    const times = document
      .getAnimations()
      .map((animation) => Number(animation.currentTime))
      .filter((time) => Number.isFinite(time))
    at = Math.max(0, ...times)
  } else if (motion.source === 'timelines') {
    const registry = (
      window as unknown as {
        __timelines?: Record<string, { time?: unknown }>
      }
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

/** A timeline a `motion` subscription found, by its request id, with the seek that holds it. */
const timelines = new Map<
  string,
  { found: FrameMotion; seek: (ms: number) => Promise<void> }
>()

/** The page's timeline, which the board reads, holds, and plays on its own clock. */
export const motionHandlers: Handlers = {
  // `readMotionIn` waits up to 10 s, past the board's reply wait, so the timeline is pushed.
  motion: (_args, { id, push, onClose }) => {
    let closed = false
    void readFrameMotion()
      .catch(() => null)
      .then((found) => {
        if (closed) return
        if (found)
          timelines.set(id, { found, seek: createSeeker(found.motion) })
        push(found)
      })
    onClose(() => {
      closed = true
      timelines.delete(id)
    })
    return true
  },
  'motion-seek': ({ motion, at }) => {
    const held = timelines.get(motion)
    if (!held) return false
    void held.seek(at)
    return true
  },
  'motion-release': ({ motion }) => {
    const held = timelines.get(motion)
    if (!held) return false
    release(held.found.motion)
    return true
  },
  'motion-moment': (found) => momentOf(found),
}
