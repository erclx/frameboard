import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

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
 * Stops the page's animation clock, through the DevTools Animation domain,
 * before the page loads. A CSS animation with no fill that ended during the
 * load would otherwise drop out of `document.getAnimations()` before the seek
 * reads it. Script timelines run on their own clocks and keep running.
 */
export async function holdAnimationClock(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('Animation.enable')
  await session.send('Animation.setPlaybackRate', { playbackRate: 0 })
}

/**
 * Finds the timeline a frame's motion runs on, taking `window.__hf` alone
 * when present, else every `window.__timelines` entry, else the page's
 * animations. A script loading its timeline late gets until `timeoutMs` to
 * register one, and a frame showing none by then refuses `motion-missing`,
 * since a scene stepped by a script timer cannot be held at a moment.
 */
export async function findMotion(
  page: Page,
  ref: string,
  timeoutMs: number,
): Promise<Motion> {
  const found = await page.evaluate(readMotion, timeoutMs)
  if (found === null) {
    throw new FrameboardError(
      'motion-missing',
      `${ref} shows no animation, transition, window.__hf, or window.__timelines to seek, so it has no moment to capture. A scene a script steps on a timer cannot be held still.`,
      { ref },
    )
  }
  return found
}

/**
 * Holds the frame at `ms`, clamped to the timeline's end, and resolves with
 * the moment it holds once a frame has painted it. HyperFrames and GSAP take
 * seconds, and the conversion happens here alone.
 */
export function seekMotion(
  page: Page,
  motion: Motion,
  ms: number,
): Promise<number> {
  return page.evaluate(holdAt, { motion, ms })
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

// Runs in the page, so it carries everything it reads.
async function readMotion(timeoutMs: number): Promise<Motion | null> {
  interface Timeline {
    seek?: unknown
    duration?: unknown
  }
  const end = performance.now() + timeoutMs
  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()))
  const seconds = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value * 1000)
      : null
  const read = (): Motion | null => {
    // HyperFrames' own capture waits for a positive duration as the ready mark.
    const hf = (window as { __hf?: Timeline }).__hf
    const hfDuration = seconds(hf?.duration)
    if (
      typeof hf?.seek === 'function' &&
      hfDuration !== null &&
      hfDuration > 0
    ) {
      return { source: 'hf', duration: hfDuration }
    }
    const registry = (window as { __timelines?: Record<string, Timeline> })
      .__timelines
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
    const animations = document.getAnimations()
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
    if (motion !== null || performance.now() >= end) return motion
    await nextFrame()
  }
}

// Runs in the page, so it carries everything it reads.
async function holdAt({
  motion,
  ms,
}: {
  motion: Motion
  ms: number
}): Promise<number> {
  interface Timeline {
    seek: (time: number) => unknown
    pause?: () => unknown
  }
  const at =
    motion.duration === null ? ms : Math.min(Math.max(ms, 0), motion.duration)
  if (motion.source === 'hf') {
    await (window as unknown as { __hf: Timeline }).__hf.seek(at / 1000)
  } else if (motion.source === 'timelines') {
    const registry = (
      window as unknown as { __timelines: Record<string, Timeline> }
    ).__timelines
    for (const timeline of Object.values(registry)) {
      if (typeof timeline?.seek !== 'function') continue
      timeline.pause?.()
      await timeline.seek(at / 1000)
    }
  } else {
    for (const animation of document.getAnimations()) {
      animation.pause()
      animation.currentTime = at
    }
  }
  // Two frames, so the held style has painted before the shot.
  await new Promise<void>((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  )
  return at
}
