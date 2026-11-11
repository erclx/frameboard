import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

interface UnsettledImage {
  /** The element's address index, skipping Frameboard's own injected elements. */
  index: number
  /** The `src` as the frame wrote it, or the source the browser picked from `srcset`. */
  src: string
  /** `error` for a request or decode that failed, `pending` for one still running. */
  state: 'error' | 'pending'
}

/**
 * Waits, within `timeoutMs`, until every `<img>` in the frame has loaded and
 * decoded, so an image marked `decoding="async"` never shoots as an empty
 * box. A lazy image is made eager in the loaded page first, never in the
 * file, so one below the box loads too.
 *
 * Under `require` an image that errored or is still loading when the time
 * runs out refuses `image-missing`. Under `wait` the frame opens with it as
 * the board shows it.
 */
export async function settleImages(
  page: Page,
  ref: string,
  mode: 'require' | 'wait',
  timeoutMs: number,
): Promise<void> {
  const unsettled = await page.evaluate(waitForImages, Math.max(0, timeoutMs))
  const [first] = unsettled
  if (mode === 'wait' || first === undefined) return
  const why =
    first.state === 'error'
      ? 'failed to load'
      : "was still loading when the frame's load budget ran out"
  throw new FrameboardError(
    'image-missing',
    `${ref} shows the image ${first.src} at element ${first.index}, and it ${why}. Point it at a file the frame can load, such as one in the project's assets/.`,
    { ref, src: first.src, element: first.index },
  )
}

// Runs in the page, so it carries everything it reads.
async function waitForImages(timeoutMs: number): Promise<UnsettledImage[]> {
  const images: { index: number; img: HTMLImageElement }[] = []
  let index = 0
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (!(element instanceof HTMLImageElement)) continue
    // An image naming no source requests nothing, so there is nothing to wait on.
    if (!element.getAttribute('src') && !element.getAttribute('srcset')) {
      continue
    }
    if (element.loading === 'lazy') element.loading = 'eager'
    images.push({ index: own, img: element })
  }
  if (images.length === 0) return []

  const settle = async (img: HTMLImageElement): Promise<'ok' | 'error'> => {
    if (!img.complete) {
      await new Promise((done) => {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    }
    // `decode` rejects for an image that failed, which covers both a failed
    // request and bytes the browser could not read.
    return img.decode().then(
      () => 'ok' as const,
      () => 'error' as const,
    )
  }

  const outcomes = images.map(({ img }) => ({
    state: 'pending' as 'ok' | 'error' | 'pending',
    done: settle(img),
  }))
  for (const outcome of outcomes) {
    void outcome.done.then((state) => {
      outcome.state = state
    })
  }
  await Promise.race([
    Promise.all(outcomes.map((outcome) => outcome.done)),
    new Promise((done) => setTimeout(done, timeoutMs)),
  ])

  const unsettled: (UnsettledImage & { loaded: boolean })[] = []
  images.forEach(({ index: own, img }, at) => {
    const state = outcomes[at]?.state
    if (state === undefined || state === 'ok') return
    unsettled.push({
      index: own,
      src: img.getAttribute('src') || img.currentSrc,
      state,
      loaded: img.complete,
    })
  })
  // A stalled load reads with no time left, so an image still decoding can
  // be pending beside the one whose request holds the page. That one leads.
  return unsettled
    .sort((a, b) => Number(a.loaded) - Number(b.loaded))
    .map(({ index: own, src, state }) => ({ index: own, src, state }))
}
