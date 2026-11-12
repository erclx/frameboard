import { FrameboardError } from './errors'

/**
 * Where a frame's timeline was found: HyperFrames' `window.__hf`, the
 * `window.__timelines` registry its compositions fill, or the page's own CSS
 * and Web Animations through `document.getAnimations()`.
 */
export type MotionSource = 'hf' | 'timelines' | 'css'

export interface Motion {
  source: MotionSource
  /** The timeline's length in milliseconds, or null when every animation repeats forever. */
  duration: number | null
}

/**
 * Finds the timeline a page's motion runs on, taking `__hf` alone when
 * present, else every `__timelines` entry, else the page's animations, and
 * resolves null when none registers within `timeoutMs`.
 *
 * Capture evaluates this in a page by its source text and the board calls it
 * on an iframe's window, so it reads nothing outside its own body and takes
 * its clock, frames, and document from `view`, never the caller's realm.
 */
export async function readMotionIn(
  view: Window,
  timeoutMs: number,
): Promise<Motion | null> {
  interface Timeline {
    seek?: unknown
    duration?: unknown
  }
  const end = view.performance.now() + timeoutMs
  const nextFrame = () =>
    new Promise<void>((done) => view.requestAnimationFrame(() => done()))
  const seconds = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value * 1000)
      : null
  const read = (): Motion | null => {
    // HyperFrames' own capture waits for a positive duration as the ready mark.
    const hf = (view as unknown as { __hf?: Timeline }).__hf
    const hfDuration = seconds(hf?.duration)
    if (
      typeof hf?.seek === 'function' &&
      hfDuration !== null &&
      hfDuration > 0
    ) {
      return { source: 'hf', duration: hfDuration }
    }
    const registry = (
      view as unknown as { __timelines?: Record<string, Timeline> }
    ).__timelines
    const timelines = Object.values(registry ?? {}).filter(
      (timeline) => typeof timeline?.seek === 'function',
    )
    if (timelines.length > 0) {
      const lengths = timelines.map((timeline) =>
        seconds(
          typeof timeline.duration === 'function'
            ? (timeline.duration as () => unknown).call(timeline)
            : timeline.duration,
        ),
      )
      const finite = lengths.filter((length) => length !== null)
      return {
        source: 'timelines',
        duration: finite.length === 0 ? null : Math.max(...finite),
      }
    }
    const animations = view.document.getAnimations()
    if (animations.length > 0) {
      const ends = animations
        .map((animation) => animation.effect?.getComputedTiming().endTime)
        .filter(
          (endTime): endTime is number =>
            typeof endTime === 'number' && Number.isFinite(endTime),
        )
      return {
        source: 'css',
        duration: ends.length === 0 ? null : Math.round(Math.max(...ends)),
      }
    }
    return null
  }

  // A page starting an animation on its first frame after load has not
  // started it yet, so the first read waits for that frame to pass.
  await nextFrame()
  for (;;) {
    const motion = read()
    if (motion !== null || view.performance.now() >= end) return motion
    await nextFrame()
  }
}

/**
 * Holds the page at `ms`, clamped to the timeline's end, and resolves with
 * the moment it holds once a frame has painted it. HyperFrames and GSAP take
 * seconds, and the conversion happens here alone. Self-contained for the
 * same reason as `readMotionIn`.
 */
export async function holdMotionIn(
  view: Window,
  { motion, ms }: { motion: Motion; ms: number },
): Promise<number> {
  interface Timeline {
    seek: (time: number) => unknown
    pause?: () => unknown
  }
  const at =
    motion.duration === null ? ms : Math.min(Math.max(ms, 0), motion.duration)
  if (motion.source === 'hf') {
    await (view as unknown as { __hf: Timeline }).__hf.seek(at / 1000)
  } else if (motion.source === 'timelines') {
    const registry = (
      view as unknown as { __timelines: Record<string, Timeline> }
    ).__timelines
    for (const timeline of Object.values(registry)) {
      if (typeof timeline?.seek !== 'function') continue
      timeline.pause?.()
      await timeline.seek(at / 1000)
    }
  } else {
    for (const animation of view.document.getAnimations()) {
      animation.pause()
      animation.currentTime = at
    }
  }
  // Two frames, so the held style has painted before anything reads it.
  await new Promise<void>((done) =>
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => done())),
  )
  return at
}

/**
 * `count` moments spaced evenly from 0 to the timeline's end inclusive.
 * Refuses `motion-unbounded` when every animation repeats forever, since no
 * end exists to space them across.
 */
export function filmstripMoments(
  ref: string,
  motion: Motion,
  count: number,
): number[] {
  const { duration } = motion
  if (duration === null) {
    throw new FrameboardError(
      'motion-unbounded',
      `${ref} only runs animations that repeat forever, so a filmstrip has no end to space its moments across. Name the moments with --at instead.`,
      { ref, source: motion.source },
    )
  }
  return Array.from({ length: count }, (_, index) =>
    Math.round((duration * index) / (count - 1)),
  )
}
