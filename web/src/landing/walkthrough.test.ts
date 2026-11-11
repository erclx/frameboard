import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  planTrack,
  setActiveStep,
  stepAt,
  wireWalkthrough,
} from './walkthrough'

function renderWalk(): HTMLElement {
  // canon-allow-embedded: the walkthrough steps the wiring runs against, kept beside the test
  document.body.innerHTML = `
    <div data-track>
      <div data-pinned>
        <div data-walk>
          <ol>
            <li data-step="0" aria-current="step"><h3><button type="button">Writes</button></h3><p>Writes body</p></li>
            <li data-step="1"><h3><button type="button">Checks</button></h3><p>Checks body</p></li>
            <li data-step="2"><h3><button type="button">Tweak</button></h3><p>Tweak body</p></li>
          </ol>
          <div data-stills>
            <img alt="Writes still" data-step="0" />
            <img alt="Checks still" data-step="1" hidden />
            <img alt="Tweak still" data-step="2" hidden />
          </div>
        </div>
      </div>
    </div>`
  const track = document.querySelector<HTMLElement>('[data-track]')
  if (!track) throw new Error('track did not render')
  return track
}

function stepButton(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('stepAt', () => {
  const segment = 300

  it('holds the first step before the track reaches the pin', () => {
    expect(stepAt({ trackTop: 500, pin: 100, segment, count: 6 })).toBe(0)
  })

  it('opens the step whose segment the pin sits in', () => {
    expect(
      stepAt({ trackTop: 100 - 2.5 * 300, pin: 100, segment, count: 6 }),
    ).toBe(2)
  })

  it('moves to the next step exactly at a segment edge', () => {
    expect(stepAt({ trackTop: 100 - 300, pin: 100, segment, count: 6 })).toBe(1)
  })

  it('holds the last step once the track has scrolled past', () => {
    expect(stepAt({ trackTop: -9000, pin: 100, segment, count: 6 })).toBe(5)
  })
})

describe('planTrack', () => {
  it('pins at the bar plus a quarter of the free space', () => {
    const plan = planTrack({
      bar: 64,
      viewport: 900,
      block: 549,
      narrow: false,
    })

    expect(plan).toEqual({ pinned: true, top: 136, segment: 342 })
  })

  it('keeps the pin at least 24 px under the bar when space is tight', () => {
    const plan = planTrack({
      bar: 64,
      viewport: 660,
      block: 580,
      narrow: false,
    })

    expect(plan.top).toBe(88)
  })

  it('keeps the pin at least 8 px under a narrow bar', () => {
    const plan = planTrack({ bar: 56, viewport: 820, block: 745, narrow: true })

    expect(plan.top).toBe(64)
  })

  it('gives each step at least 240 px of scroll', () => {
    const plan = planTrack({ bar: 56, viewport: 600, block: 400, narrow: true })

    expect(plan.segment).toBe(240)
  })

  it('does not pin a block taller than the window under the bar', () => {
    const plan = planTrack({ bar: 56, viewport: 667, block: 745, narrow: true })

    expect(plan.pinned).toBe(false)
  })
})

describe('setActiveStep', () => {
  it('marks only the step being read as current', () => {
    const track = renderWalk()

    setActiveStep(track, 2)

    const current = track.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Tweak')
  })

  it('opens the body of the current step alone', () => {
    const track = renderWalk()

    setActiveStep(track, 1)

    expect(screen.getByText('Checks body')).toBeVisible()
    expect(screen.queryByText('Writes body')).not.toBeVisible()
    expect(screen.queryByText('Tweak body')).not.toBeVisible()
  })

  it('reports the open step on its button', () => {
    const track = renderWalk()

    setActiveStep(track, 1)

    expect(stepButton('Checks')).toHaveAttribute('aria-expanded', 'true')
    expect(stepButton('Writes')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the still paired with the step and hides the rest', async () => {
    const track = renderWalk()

    await setActiveStep(track, 1)

    expect(screen.getByRole('img', { name: 'Checks still' })).toBeVisible()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
})

describe('setActiveStep with a still still decoding', () => {
  interface Decode {
    resolve: () => void
    reject: () => void
  }

  function holdDecode(name: string): Decode {
    const still = screen.getByAltText(name)
    const held = {} as Decode
    const decoding = new Promise<void>((resolve, reject) => {
      held.resolve = resolve
      held.reject = () => reject(new DOMException('', 'EncodingError'))
    })
    Object.defineProperty(still, 'decode', { value: () => decoding })
    return held
  }

  it('keeps the open still on screen until the next one decodes', () => {
    const track = renderWalk()
    holdDecode('Checks still')

    void setActiveStep(track, 1)

    expect(screen.getByText('Checks body')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Writes still' })).toBeVisible()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('swaps to the still once its decode resolves', async () => {
    const track = renderWalk()
    const decode = holdDecode('Checks still')

    const swapped = setActiveStep(track, 1)
    decode.resolve()
    await swapped

    expect(screen.getByRole('img', { name: 'Checks still' })).toBeVisible()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('still shows the still when its decode fails', async () => {
    const track = renderWalk()
    const decode = holdDecode('Checks still')

    const swapped = setActiveStep(track, 1)
    decode.reject()
    await swapped

    expect(screen.getByRole('img', { name: 'Checks still' })).toBeVisible()
  })

  it('keeps the later step when an earlier decode resolves after it', async () => {
    const track = renderWalk()
    const checks = holdDecode('Checks still')

    const first = setActiveStep(track, 1)
    await setActiveStep(track, 2)
    checks.resolve()
    await first

    expect(screen.getByRole('img', { name: 'Tweak still' })).toBeVisible()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
})

describe('wireWalkthrough', () => {
  function blockHeight(px: number): void {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px)
  }

  it('opens a step on click when the block is too tall to pin', async () => {
    blockHeight(5000)
    const user = userEvent.setup()
    const track = renderWalk()
    wireWalkthrough(track)

    await user.click(stepButton('Tweak'))

    expect(screen.getByText('Tweak body')).toBeVisible()
  })

  it('scrolls to the step on click when the block pins', async () => {
    blockHeight(300)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const user = userEvent.setup()
    const track = renderWalk()
    wireWalkthrough(track)

    await user.click(stepButton('Tweak'))

    expect(scrollTo).toHaveBeenCalledOnce()
  })

  it('keeps one step in the tab order, starting at the first', () => {
    blockHeight(300)
    const track = renderWalk()

    wireWalkthrough(track)

    expect(stepButton('Writes')).toHaveAttribute('tabindex', '0')
    expect(stepButton('Checks')).toHaveAttribute('tabindex', '-1')
    expect(stepButton('Tweak')).toHaveAttribute('tabindex', '-1')
  })

  it('moves focus and the tab stop down with the arrow key', async () => {
    blockHeight(300)
    const user = userEvent.setup()
    const track = renderWalk()
    wireWalkthrough(track)

    stepButton('Writes').focus()
    await user.keyboard('{ArrowDown}')

    expect(stepButton('Checks')).toHaveFocus()
    expect(stepButton('Checks')).toHaveAttribute('tabindex', '0')
    expect(stepButton('Writes')).toHaveAttribute('tabindex', '-1')
  })

  it('moves focus back up with the arrow key', async () => {
    blockHeight(300)
    const user = userEvent.setup()
    const track = renderWalk()
    wireWalkthrough(track)

    stepButton('Checks').focus()
    await user.keyboard('{ArrowUp}')

    expect(stepButton('Writes')).toHaveFocus()
  })

  it('stays on the last step at the end of the list', async () => {
    blockHeight(300)
    const user = userEvent.setup()
    const track = renderWalk()
    wireWalkthrough(track)

    stepButton('Tweak').focus()
    await user.keyboard('{ArrowDown}')

    expect(stepButton('Tweak')).toHaveFocus()
  })
})
