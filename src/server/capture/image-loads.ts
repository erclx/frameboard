import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

interface UnsettledImage {
  /** The element's address index, skipping Frameboard's own injected elements. */
  index: number
  /** The `src` as the frame wrote it, or the source the browser picked from `srcset`. */
  src: string
  /** `error` for a request or decode that failed, `pending` for one still running. */
  state: 'error' | 'pending'
  /**
   * Whether the image could have held the load event, being one the page
   * asked for eagerly whose request is still open. A lazy image's request
   * starts only when this wait makes it eager, so it never held the load.
   */
  heldLoad: boolean
}

/**
 * Waits until every `<img>` decodes, so an async image never shoots empty,
 * making lazy ones eager in the page alone. Under `require` a failed or
 * unfinished image refuses `image-missing`.
 */
export async function settleImages(
  page: Page,
  ref: string,
  mode: 'require' | 'wait',
  timeoutMs: number,
  { stalled = false }: { stalled?: boolean } = {},
): Promise<void> {
  const unsettled = await page.evaluate(waitForImages, Math.max(0, timeoutMs))
  const [first] = stalled
    ? unsettled.filter((image) => image.heldLoad || image.state === 'error')
    : unsettled
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
  const images: { index: number; img: HTMLImageElement; lazy: boolean }[] = []
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
    const lazy = element.loading === 'lazy'
    if (lazy) element.loading = 'eager'
    images.push({ index: own, img: element, lazy })
  }
  if (images.length === 0) return []

  const settle = async (img: HTMLImageElement): Promise<'ok' | 'error'> => {
    if (!img.complete) {
      await new Promise((done) => {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    }
    // `decode` rejects for both a failed request and unreadable bytes.
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

  const unsettled: UnsettledImage[] = []
  images.forEach(({ index: own, img, lazy }, at) => {
    const state = outcomes[at]?.state
    if (state === undefined || state === 'ok') return
    unsettled.push({
      index: own,
      src: img.getAttribute('src') || img.currentSrc,
      state,
      heldLoad: !lazy && !img.complete,
    })
  })
  return unsettled
}
