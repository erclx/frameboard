import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { wireThemes } from './themes'

const STEMS = ['slides', 'devices', 'play', 'images-3d', 'kits', 'hand-edits']

function renderThemes(): HTMLElement {
  // canon-allow-embedded: the themes section markup the playback wiring runs against, kept beside the test
  document.body.innerHTML = `
    <section id="themes">
      <button type="button" class="pause" hidden aria-pressed="false">Pause clips</button>
      ${STEMS.map(
        (stem) => `
        <button type="button" disabled aria-pressed="true" aria-label="Play the ${stem} clip" data-clip="the ${stem} clip">
          <video id="${stem}" muted loop playsinline preload="none"></video>
        </button>`,
      ).join('')}
    </section>`
  return document.body
}

/** Stands in for IntersectionObserver, which jsdom lacks, and lets a test move clips in and out of view. */
class FakeObserver {
  static current: FakeObserver | undefined

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.current = this
  }

  observe(): void {}

  disconnect(): void {}

  show(stem: string, ratio: number): void {
    const target = document.getElementById(stem)
    if (!target) throw new Error(`no clip ${stem}`)
    const entry = {
      target,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    } as unknown as IntersectionObserverEntry
    this.callback([entry], this as unknown as IntersectionObserver)
  }
}

function observer(): FakeObserver {
  if (!FakeObserver.current) throw new Error('wireThemes observed nothing')
  return FakeObserver.current
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
  }))
}

function clip(stem: string): HTMLVideoElement {
  const video = document.getElementById(stem)
  if (!(video instanceof HTMLVideoElement)) throw new Error(`no clip ${stem}`)
  return video
}

function clipButton(stem: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`the ${stem} clip`) })
}

function playing(): string[] {
  return STEMS.filter((stem) => !clip(stem).paused)
}

beforeEach(() => {
  // jsdom implements no playback, so play and pause flip `paused` the way a browser does.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true })
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true })
  })
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  stubReducedMotion(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeObserver.current = undefined
  document.body.innerHTML = ''
})

describe('wireThemes', () => {
  it('shows the section pause and enables each clip button once scripts run', () => {
    wireThemes(renderThemes())

    expect(screen.getByRole('button', { name: 'Pause clips' })).toBeVisible()
    expect(clipButton('slides')).toBeEnabled()
  })

  it('plays a clip once half of it is in view', () => {
    wireThemes(renderThemes())

    observer().show('slides', 0.5)

    expect(playing()).toEqual(['slides'])
  })

  it('leaves a clip under half in view paused', () => {
    wireThemes(renderThemes())

    observer().show('slides', 0.4)

    expect(playing()).toEqual([])
  })

  it('pauses a clip as it leaves view', () => {
    wireThemes(renderThemes())
    observer().show('slides', 1)

    observer().show('slides', 0.2)

    expect(playing()).toEqual([])
  })

  it('marks a playing clip button as not paused', () => {
    wireThemes(renderThemes())

    observer().show('devices', 1)

    expect(clipButton('devices')).toHaveAttribute('aria-pressed', 'false')
    expect(clipButton('devices')).toHaveAccessibleName('Pause the devices clip')
  })
})

describe('the section pause', () => {
  it('holds every clip, including ones entering view after it', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    observer().show('devices', 1)

    await user.click(screen.getByRole('button', { name: 'Pause clips' }))
    observer().show('play', 1)

    expect(playing()).toEqual([])
    expect(screen.getByRole('button', { name: 'Play clips' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('resumes only the clips in view on play', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    observer().show('devices', 1)
    await user.click(screen.getByRole('button', { name: 'Pause clips' }))
    observer().show('devices', 0)

    await user.click(screen.getByRole('button', { name: 'Play clips' }))

    expect(playing()).toEqual(['slides'])
  })

  it('stops a clip started by its own button', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    await user.click(screen.getByRole('button', { name: 'Pause clips' }))
    observer().show('kits', 1)
    await user.click(clipButton('kits'))

    await user.click(screen.getByRole('button', { name: 'Play clips' }))
    await user.click(screen.getByRole('button', { name: 'Pause clips' }))

    expect(playing()).toEqual([])
  })
})

describe('a clip button', () => {
  it('pauses its own clip and leaves the others playing', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    observer().show('devices', 1)

    await user.click(clipButton('slides'))

    expect(playing()).toEqual(['devices'])
    expect(clipButton('slides')).toHaveAccessibleName('Play the slides clip')
  })

  it('plays its clip again on a second press', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    await user.click(clipButton('slides'))

    await user.click(clipButton('slides'))

    expect(playing()).toEqual(['slides'])
  })

  it('keeps a clip paused by hand paused as it re-enters view', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    await user.click(clipButton('slides'))
    observer().show('slides', 0)

    observer().show('slides', 1)

    expect(playing()).toEqual([])
  })

  it('keeps a clip paused by hand paused when the section plays again', async () => {
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    observer().show('devices', 1)
    await user.click(clipButton('slides'))
    await user.click(screen.getByRole('button', { name: 'Pause clips' }))

    await user.click(screen.getByRole('button', { name: 'Play clips' }))

    expect(playing()).toEqual(['devices'])
  })

  it('leaves the poster up when the browser refuses to play', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('refused', 'NotAllowedError'),
    )
    wireThemes(renderThemes())

    observer().show('slides', 1)
    await Promise.resolve()

    expect(playing()).toEqual([])
  })

  it('offers play on a clip whose play the browser refused', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new DOMException('refused', 'NotAllowedError'),
    )
    wireThemes(renderThemes())

    observer().show('slides', 1)

    await waitFor(() =>
      expect(clipButton('slides')).toHaveAccessibleName('Play the slides clip'),
    )
    expect(clipButton('slides')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('under reduced motion', () => {
  it('starts no clip in view and reads the section control as play', () => {
    stubReducedMotion(true)
    wireThemes(renderThemes())

    observer().show('slides', 1)
    observer().show('devices', 1)

    expect(playing()).toEqual([])
    expect(screen.getByRole('button', { name: 'Play clips' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('plays only the clip whose button is pressed', async () => {
    stubReducedMotion(true)
    const user = userEvent.setup()
    wireThemes(renderThemes())
    observer().show('slides', 1)
    observer().show('devices', 1)

    await user.click(clipButton('devices'))

    expect(playing()).toEqual(['devices'])
  })
})
