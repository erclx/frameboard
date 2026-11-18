import type { Page } from 'playwright-core'

/** A `<model-viewer>` a capture shot with no model in it. */
export interface UnloadedModel {
  /** The element's address index, skipping Frameboard's own injected elements. */
  index: number
  /** The `src` as the frame wrote it. */
  src: string
  /** `error` for a model or a viewer script that failed to load, `pending` for one still loading. */
  state: 'error' | 'pending'
}

/**
 * Waits for every `<model-viewer>` to draw its model, then holds each at the
 * start of its animation, so two captures match. A model with no picture is
 * returned rather than refused, as an unloaded video is.
 */
export async function settleModels(
  page: Page,
  timeoutMs: number,
): Promise<UnloadedModel[]> {
  return page.evaluate(waitForModels, Math.max(0, timeoutMs))
}

// Runs in the page, so it carries everything it reads.
async function waitForModels(timeoutMs: number): Promise<UnloadedModel[]> {
  interface Viewer extends HTMLElement {
    loaded: boolean
    modelIsVisible: boolean
    loading: string
    currentTime: number
    pause: () => void
  }
  const viewers: { index: number; viewer: Viewer; src: string }[] = []
  let index = 0
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (element.localName !== 'model-viewer') continue
    const src = element.getAttribute('src') ?? ''
    // No file requests nothing to wait on.
    if (!src) continue
    viewers.push({ index: own, viewer: element as Viewer, src })
  }
  if (viewers.length === 0) return []

  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()))

  const settle = async (viewer: Viewer): Promise<'ok' | 'error'> => {
    // Module scripts ran before the load this wait follows, so an element still undefined has no viewer.
    if (!customElements.get('model-viewer')) return 'error'
    // A viewer loads its model only inside the viewport unless told to.
    viewer.loading = 'eager'
    if (!viewer.loaded) {
      const failed = await new Promise<boolean>((done) => {
        viewer.addEventListener('load', () => done(false), { once: true })
        viewer.addEventListener('error', () => done(true), { once: true })
      })
      if (failed) return 'error'
    }
    viewer.pause()
    viewer.currentTime = 0
    // The viewer draws on its own frame loop, behind a poster a manual reveal keeps up.
    while (
      !viewer.modelIsVisible &&
      viewer.getAttribute('reveal') !== 'manual'
    ) {
      await nextFrame()
    }
    await nextFrame()
    await nextFrame()
    return 'ok'
  }

  const outcomes = viewers.map(({ viewer }) => ({
    state: 'pending' as 'ok' | 'error' | 'pending',
    done: settle(viewer),
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

  const unloaded: UnloadedModel[] = []
  viewers.forEach(({ index: own, src }, at) => {
    const state = outcomes[at]?.state
    if (state === undefined || state === 'ok') return
    unloaded.push({ index: own, src, state })
  })
  return unloaded
}
