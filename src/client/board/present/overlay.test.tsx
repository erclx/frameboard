import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { emulateReducedMotion } from '@/test/motion'

import { useBoardActions } from '../board-actions'
import { selectionStore } from '../selection'
import { fitScale } from './fit'
import { PresentOverlay } from './overlay'
import { presentStore, startPresenting } from './store'

/** Bottom of the stack first, as the server sends them, so Layers reads them reversed. */
function framesOf(...names: string[]): FrameRecord[] {
  return names.map((name, order) =>
    frameOf(name, { order, hidden: name.startsWith('hidden') }),
  )
}

function Board() {
  useBoardActions()
  return <PresentOverlay />
}

function present(frames: FrameRecord[], selected: string[] = []) {
  const page = pageOf(frames)
  liveStore.setState({ board: boardOf(page) })
  selectionStore.setState({
    page: selected.length > 0 ? page.ref : null,
    frames: selected.map((name) => `studio/home/${name}`),
  })
  render(<Board />)
  act(() => startPresenting(page))
}

const shownFrame = () => screen.getByRole('dialog').querySelector('iframe')
const count = () =>
  screen.getByRole('toolbar', { name: 'Presenting' }).textContent

afterEach(() => {
  presentStore.setState({ page: null, frame: null })
  selectionStore.setState({ page: null, frames: [] })
  liveStore.setState({ board: null })
})

describe('the scale a frame presents at', () => {
  it('meets the sides with a wide frame', () => {
    expect(
      fitScale({ width: 1920, height: 1080 }, { width: 1280, height: 800 }),
    ).toBeCloseTo(1280 / 1920)
  })

  it('meets the top and bottom with a tall frame', () => {
    expect(
      fitScale({ width: 390, height: 844 }, { width: 1280, height: 800 }),
    ).toBeCloseTo(800 / 844)
  })
})

describe('presenting a page', () => {
  it('opens on the top frame in Layers with nothing selected', () => {
    present(framesOf('third', 'second', 'first'))

    expect(shownFrame()?.title).toBe('first')
    expect(count()).toContain('1 / 3')
  })

  it('draws the frame scaled to fit the window', () => {
    present([
      frameOf('wide', { box: { x: 0, y: 0, width: 2560, height: 800 } }),
    ])

    const box = shownFrame()?.parentElement?.getBoundingClientRect()

    expect(box?.width).toBeCloseTo(window.innerWidth)
    expect(box?.left).toBeCloseTo(0)
  })

  it('steps by arrow in Layers order, skipping hidden frames', async () => {
    present(framesOf('third', 'hidden', 'second', 'first'))

    await userEvent.keyboard('{ArrowRight}')
    expect(shownFrame()?.title).toBe('second')
    await userEvent.keyboard('{ArrowRight}')
    expect(shownFrame()?.title).toBe('third')
    await userEvent.keyboard('{ArrowLeft}')
    expect(shownFrame()?.title).toBe('second')
  })

  it('stays on the last frame on Next, the count reading n / n', async () => {
    present(framesOf('second', 'first'))

    await userEvent.keyboard('{ArrowRight}{ArrowRight}[Space]')

    expect(shownFrame()?.title).toBe('second')
    expect(count()).toContain('2 / 2')
  })

  it('starts from the selected frame', () => {
    present(framesOf('third', 'second', 'first'), ['second'])

    expect(shownFrame()?.title).toBe('second')
  })

  it('starts from a selected hidden frame at the next shown one', () => {
    present(framesOf('third', 'hidden', 'first'), ['hidden'])

    expect(shownFrame()?.title).toBe('third')
  })

  it('keeps the frame shown when an agent hides it mid-presentation', () => {
    const frames = framesOf('second', 'first')
    present(frames)

    act(() =>
      liveStore.setState({
        board: boardOf(
          pageOf(
            frames.map((frame) =>
              frame.name === 'first' ? { ...frame, hidden: true } : frame,
            ),
          ),
        ),
      }),
    )

    expect(shownFrame()?.title).toBe('first')
  })

  it('leaves on Esc with the presented frame selected', async () => {
    present(framesOf('second', 'first'))

    await userEvent.keyboard('{ArrowRight}{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(selectionStore.getState().frames).toEqual(['studio/home/second'])
  })

  it('presses a focused bar button with Space rather than stepping', async () => {
    present(framesOf('second', 'first'))
    screen.getByRole('button', { name: 'Leave presenting' }).focus()

    await userEvent.keyboard('[Space]')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(selectionStore.getState().frames).toEqual(['studio/home/first'])
  })

  it('makes the board behind it inert, so Tab stays in the overlay', () => {
    const behind = document.createElement('div')
    behind.innerHTML = '<button type="button">Home</button>'
    document.body.append(behind)
    present(framesOf('first'))

    expect(behind.inert).toBe(true)

    act(() => presentStore.setState({ page: null, frame: null }))

    expect(behind.inert).toBe(false)
    behind.remove()
  })

  it('leaves from the bar', async () => {
    present(framesOf('first'))

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave presenting' }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the bar', () => {
  const bar = () => screen.getByRole('toolbar', { name: 'Presenting' })
  const opacity = () => getComputedStyle(bar()).opacity

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('opens hidden, shows on a pointer move, and hides two seconds still', () => {
    present(framesOf('first'))
    const layer = screen.getByRole('dialog')
    expect(bar()).not.toHaveAttribute('data-shown')

    act(() => {
      layer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    })
    expect(bar()).toHaveAttribute('data-shown')

    act(() => vi.advanceTimersByTime(1999))
    expect(bar()).toHaveAttribute('data-shown')
    act(() => vi.advanceTimersByTime(1))
    expect(bar()).not.toHaveAttribute('data-shown')
  })

  it('fades its opacity', () => {
    present(framesOf('first'))

    expect(getComputedStyle(bar()).transitionProperty).toContain('opacity')
    expect(opacity()).toBe('0')
  })

  describe('under reduced motion', () => {
    beforeEach(async () => {
      await emulateReducedMotion(true)
    })

    afterEach(async () => {
      await emulateReducedMotion(false)
    })

    it('shows and hides with no fade', () => {
      present(framesOf('first'))

      expect(getComputedStyle(bar()).transitionDuration).toBe('0s')
    })
  })
})
