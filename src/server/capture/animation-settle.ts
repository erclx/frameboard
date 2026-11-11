import type { Page } from 'playwright-core'

/**
 * Waits, within `timeoutMs`, until every running animation and transition
 * with a finite end has finished, reading again after each round so one that
 * another starts is awaited too. An infinite animation is never awaited, and
 * running out of time returns rather than refusing, since a long or
 * restarting animation is a design and not a failure.
 *
 * It sees only what `document.getAnimations()` lists, so a scene a script
 * steps on a timer stays out of reach.
 */
export async function settleAnimations(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  if (timeoutMs <= 0) return
  await page.evaluate(waitForAnimations, timeoutMs)
}

// Runs in the page, so it carries everything it reads.
async function waitForAnimations(timeoutMs: number): Promise<void> {
  const end = performance.now() + timeoutMs
  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()))
  const finiteRunning = () =>
    document.getAnimations().filter((animation) => {
      if (animation.playState !== 'running') return false
      const endTime = animation.effect?.getComputedTiming().endTime
      return typeof endTime === 'number' && Number.isFinite(endTime)
    })

  // A page starting an animation on its first frame after load has not
  // started it yet, so the first read waits for that frame to pass.
  await nextFrame()
  for (;;) {
    const running = finiteRunning()
    const left = end - performance.now()
    if (running.length === 0 || left <= 0) return
    await Promise.race([
      Promise.all(
        running.map((animation) => animation.finished.catch(() => {})),
      ),
      new Promise((done) => setTimeout(done, left)),
    ])
    // An animation's end event starts the next one in the frame after.
    await nextFrame()
  }
}
