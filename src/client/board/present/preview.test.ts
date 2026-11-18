import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedTransition } from '@/shared/present-transition'

import { playPreview, previewTransition, stopPreview } from './preview'

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
