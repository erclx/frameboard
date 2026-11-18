import type { Page } from 'playwright-core'

import { LOOK_MARKER } from '@/shared/theme'

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
 * Records each viewer whose load fails, from before the frame's scripts run.
 * A viewer keeps no failed state to read and can fire its `error` ahead of
 * `settleModels`, which would then wait on an event already gone.
 */
export async function watchModels(page: Page): Promise<void> {
  await page.addInitScript(recordFailedModels)
}

// Runs in the page, so it carries everything it reads.
function recordFailedModels(): void {
  const failed = new WeakSet<EventTarget>()
  Object.defineProperty(window, Symbol.for('frameboard.failed-models'), {
    value: failed,
  })
  const isViewer = (target: EventTarget | null): target is Element =>
    target instanceof Element && target.localName === 'model-viewer'
  // Neither event bubbles, and a `load` never reaches the window.
  document.addEventListener(
    'error',
    ({ target }) => {
      if (isViewer(target)) failed.add(target)
    },
    true,
  )
  document.addEventListener(
    'load',
    ({ target }) => {
      if (isViewer(target)) failed.delete(target)
    },
    true,
  )
}

/**
 * Waits for every `<model-viewer>` to draw its model, then holds each at the
 * start of its animation, so two captures match. A model with no picture is
 * returned rather than refused, as an unloaded video is. Reads the failures
 * `watchModels` recorded on the same page, and hides each viewer's loading
 * bar, which is no part of the frame at rest.
 */
export async function settleModels(
  page: Page,
  timeoutMs: number,
): Promise<UnloadedModel[]> {
  return page.evaluate(waitForModels, {
    timeoutMs: Math.max(0, timeoutMs),
    marker: LOOK_MARKER,
  })
}

// Runs in the page, so it carries everything it reads.
async function waitForModels({
  timeoutMs,
  marker,
}: {
  timeoutMs: number
  marker: string
}): Promise<UnloadedModel[]> {
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

  // A viewer fades its loading bar out over a second, and a held clock freezes it at whatever width it reached.
  const bar = document.createElement('style')
  // Marked as the board's own, so no element's file index moves.
  bar.setAttribute(marker, '')
  bar.textContent = 'model-viewer { --progress-bar-height: 0px !important }'
  document.head.append(bar)

  const failed = (
    window as unknown as Record<symbol, WeakSet<EventTarget> | undefined>
  )[Symbol.for('frameboard.failed-models')]

  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()))

  // The viewer's own reading at its own threshold, since it draws no model the viewport misses.
  const inViewport = (viewer: Viewer) =>
    new Promise<boolean>((done) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          observer.disconnect()
          done(entry?.isIntersecting ?? false)
        },
        { threshold: 0.00001 },
      )
      observer.observe(viewer)
    })

  const settle = async (viewer: Viewer): Promise<'ok' | 'error'> => {
    // Module scripts ran before the load this wait follows, so an element still undefined has no viewer.
    if (!customElements.get('model-viewer')) return 'error'
    // A viewer loads its model only inside the viewport unless told to.
    viewer.loading = 'eager'
    if (!viewer.loaded) {
      if (failed?.has(viewer)) return 'error'
      const loads = await new Promise<boolean>((done) => {
        viewer.addEventListener('load', () => done(true), { once: true })
        viewer.addEventListener('error', () => done(false), { once: true })
      })
      if (!loads) return 'error'
    }
    viewer.pause()
    viewer.currentTime = 0
    if (!(await inViewport(viewer))) return 'ok'
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
