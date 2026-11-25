import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { frameElements } from '@/shared/frame-bridge/elements'
import type { ResolvedTransition } from '@/shared/present-transition'
import { BRIDGE } from '@/test/frame-bridge'

import {
  playPreview,
  previewStepOn,
  previewTransition,
  stopPreview,
} from './preview'

/** A frame on the canvas, holding the inline style a live one carries. */
function frame(): HTMLElement {
  const iframe = document.createElement('iframe')
  iframe.style.setProperty('color-scheme', 'light')
  document.body.append(iframe)
  return iframe
}

const travelOf = (transition: ResolvedTransition) => ({
  transition,
  back: false,
})

const PUSH = travelOf({ name: 'push', direction: 'left', ms: 500 })
const FADE = travelOf({ name: 'fade', direction: null, ms: 300 })

/** Answers the reduced motion query as `reduced`. */
function motion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: reduced, media: query }) as MediaQueryList,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  motion(false)
})

afterEach(() => {
  stopPreview()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('previewTransition', () => {
  it("plays the arrival's keyframes on the frame", () => {
    const target = frame()

    previewTransition(target, FADE, 'studio')

    expect(target.style.animationName).toBe('fb-present-fade-enter')
  })

  it('clips a push where it passes the frame, on the same length', () => {
    const target = frame()

    previewTransition(target, PUSH, 'studio')

    expect({
      names: target.style.animationName,
      durations: target.style.animationDuration,
      right: target.style.getPropertyValue('--clip-right'),
      left: target.style.getPropertyValue('--clip-left'),
    }).toEqual({
      names: 'fb-present-push-enter, fb-preview-clip',
      durations: '500ms, 500ms',
      right: '100%',
      left: '0%',
    })
  })

  it('leaves the frame as it was once the transition ends', () => {
    const target = frame()
    const before = target.getAttribute('style')

    previewTransition(target, PUSH, 'studio')
    vi.advanceTimersByTime(500)

    expect(target.getAttribute('style')).toBe(before)
  })

  it('plays nothing for None', () => {
    const target = frame()
    const before = target.getAttribute('style')

    previewTransition(
      target,
      travelOf({ name: 'none', direction: null, ms: 0 }),
      'studio',
    )

    expect(target.getAttribute('style')).toBe(before)
  })
})

describe('playPreview', () => {
  it('ends the preview playing before starting the next', () => {
    const first = frame()
    const second = frame()
    const before = first.getAttribute('style')

    playPreview(() => previewTransition(first, PUSH, 'studio'))
    playPreview(() => previewTransition(second, FADE, 'studio'))

    expect([first.getAttribute('style'), second.style.animationName]).toEqual([
      before,
      'fb-present-fade-enter',
    ])
  })

  it('restores the frame at once on a stop', () => {
    const target = frame()
    const before = target.getAttribute('style')

    playPreview(() => previewTransition(target, PUSH, 'studio'))
    stopPreview()

    expect(target.getAttribute('style')).toBe(before)
  })

  it('starts nothing under reduced motion', () => {
    motion(true)
    const start = vi.fn(() => () => {})

    playPreview(start)

    expect(start).not.toHaveBeenCalled()
  })
})

describe('previewStepOn', () => {
  /** A selected slide on the canvas whose live page holds `body`, loaded. */
  async function liveSlide(ref: string, body: string): Promise<Document> {
    const frame = document.createElement('div')
    frame.dataset.frame = ref
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style>${BRIDGE}</head><body>${body}</body></html>`
    frame.append(iframe)
    document.body.append(frame)
    await loaded
    const doc = iframe.contentDocument
    if (!doc) throw new Error('The slide has no document')
    return doc
  }

  it('plays on the element the selection indexes in the live page', async () => {
    vi.useRealTimers()
    const doc = await liveSlide(
      'studio/home/hero',
      '<p id="one">One</p><p id="two" data-step="2">Two</p>',
    )
    const two = doc.getElementById('two')
    if (!two) throw new Error('No step element')
    const index = frameElements(doc).indexOf(two)

    previewStepOn({ frame: 'studio/home/hero', index, hash: '' }, 'wipe')

    await expect
      .poll(() => two.getAttribute('data-frameboard-step-effect'))
      .toBe('wipe')
    expect(
      doc.getElementById('one')?.hasAttribute('data-frameboard-step'),
    ).toBe(false)
  })

  it('plays for the length it is given', async () => {
    vi.useRealTimers()
    const doc = await liveSlide(
      'studio/home/hero',
      '<p id="one" data-step="1">One</p>',
    )
    const one = doc.getElementById('one')
    if (!one) throw new Error('No step element')
    const index = frameElements(doc).indexOf(one)

    previewStepOn({ frame: 'studio/home/hero', index, hash: '' }, 'fade', 1800)

    await expect
      .poll(() => doc.defaultView?.getComputedStyle(one).animationDuration)
      .toBe('1.8s')
  })

  it('takes the marks back when a second preview starts', async () => {
    vi.useRealTimers()
    const doc = await liveSlide(
      'studio/home/hero',
      '<p id="one" data-step="1">One</p><p id="two" data-step="2">Two</p>',
    )
    const [one, two] = ['one', 'two'].map((id) => doc.getElementById(id))
    if (!one || !two) throw new Error('No step element')
    const at = (element: Element) => frameElements(doc).indexOf(element)
    previewStepOn(
      { frame: 'studio/home/hero', index: at(one), hash: '' },
      'fade',
    )
    await expect.poll(() => one.hasAttribute('data-frameboard-step')).toBe(true)

    previewStepOn(
      { frame: 'studio/home/hero', index: at(two), hash: '' },
      'zoom',
    )

    await expect.poll(() => two.hasAttribute('data-frameboard-step')).toBe(true)
    expect(one.hasAttribute('data-frameboard-step')).toBe(false)
  })
})
