import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'
import { holdMotionIn, type Motion, readMotionIn } from '@/shared/motion'

export {
  filmstripMoments,
  type Motion,
  type MotionSource,
} from '@/shared/motion'

/**
 * Stops the animation clock before load, since an unfilled CSS animation
 * ending mid-load would drop out of `getAnimations()` before the seek.
 */
export async function holdAnimationClock(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('Animation.enable')
  await session.send('Animation.setPlaybackRate', { playbackRate: 0 })
}

/**
 * Finds the frame's timeline, refusing `motion-missing` when none registers by
 * `timeoutMs`, since a script-timer scene cannot be held at a moment.
 */
export async function findMotion(
  page: Page,
  ref: string,
  timeoutMs: number,
): Promise<Motion> {
  const found = await page.evaluate<Motion | null>(
    inPage(readMotionIn, timeoutMs),
  )
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
 * the moment it holds once a frame has painted it.
 */
export function seekMotion(
  page: Page,
  motion: Motion,
  ms: number,
): Promise<number> {
  return page.evaluate<number>(inPage(holdMotionIn, { motion, ms }))
}

/**
 * The expression calling a shared window function on the page's own
 * `window`, by its source text, since Playwright sends a page only text and
 * the board imports the same function to call on an iframe's window.
 */
function inPage<A>(run: (view: Window, arg: A) => unknown, arg: A): string {
  return `(${run.toString()})(window, ${JSON.stringify(arg)})`
}
