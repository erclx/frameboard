import type { Page } from 'playwright-core'

/**
 * Waits out every finite animation, returning rather than refusing at the
 * limit, since a long animation is a design, and seeing only what
 * `document.getAnimations()` lists.
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

  // Waits a frame, since an animation starting on the first frame has not yet.
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
