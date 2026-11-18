import { FrameboardError } from './errors'

/**
 * Where a frame's timeline was found: HyperFrames' `window.__hf`, its
 * `window.__timelines` registry, the page's own CSS and Web Animations
 * through `document.getAnimations()`, or the clip a `<model-viewer>` plays.
 */
export type MotionSource = 'hf' | 'timelines' | 'css' | 'model'

export interface Motion {
  source: MotionSource
  /** The timeline's length in milliseconds, or null when every animation repeats forever. */
  duration: number | null
}

/**
 * Finds a page's motion timeline. Capture evaluates it by source text, so it
 * reads nothing outside its own body and takes everything from `view`.
 */
export async function readMotionIn(
  view: Window,
  timeoutMs: number,
): Promise<Motion | null> {
  interface Timeline {
    seek?: unknown
    duration?: unknown
  }
  interface Clip {
    availableAnimations?: unknown[]
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
    // A viewer lists its clips once its model loads, which a capture waits on first.
    const clips = [...view.document.querySelectorAll('model-viewer')]
      .map((viewer) => viewer as Element & Clip)
      .filter((viewer) => (viewer.availableAnimations?.length ?? 0) > 0)
    if (clips.length > 0) {
      const lengths = clips
        .map((viewer) => seconds(viewer.duration))
        .filter((length) => length !== null)
      return {
        source: 'model',
        duration: lengths.length === 0 ? null : Math.max(...lengths),
      }
    }
    return null
  }

  // Waits a frame, since an animation starting on the first frame has not yet.
  await nextFrame()
  for (;;) {
    const motion = read()
    if (motion !== null || view.performance.now() >= end) return motion
    await nextFrame()
  }
}

/**
 * Holds the page at `ms` once painted, converting to the seconds HyperFrames,
 * GSAP, and a model viewer take here alone, self-contained as `readMotionIn` is.
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
  } else if (motion.source === 'css') {
    for (const animation of view.document.getAnimations()) {
      animation.pause()
      animation.currentTime = at
    }
  }
  // Whatever the page's timeline, every model holds the same moment of its own clip.
  for (const element of view.document.querySelectorAll('model-viewer')) {
    const viewer = element as Element & {
      pause?: () => void
      currentTime?: number
    }
    if (typeof viewer.pause !== 'function') continue
    viewer.pause()
    viewer.currentTime = at / 1000
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
