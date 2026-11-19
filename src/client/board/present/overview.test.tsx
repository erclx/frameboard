import '../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { useBoardActions } from '../board-actions'
import { selectionStore } from '../selection'
import { PresentOverlay } from './overlay'
import { presentStore, startPresenting, stepPresenting } from './store'

/** Twelve 16:9 slides in one row, laid in reading order, a name starting `hidden` hiding its frame. */
function slidesOf(...names: string[]): FrameRecord[] {
  return names.map((name, at) =>
    frameOf(name, {
      box: { x: at * 1400, y: 0, width: 1280, height: 720 },
      hidden: name.startsWith('hidden'),
    }),
  )
}

const TWELVE = Array.from({ length: 12 }, (_, at) => `slide-${at + 1}`)

/** A request answering no stamps, recording what each ask named. */
function quietSend() {
  const asked: string[] = []
  const send = (async (input: RequestInfo | URL) => {
    asked.push(String(input))
    return Response.json({ ok: true, data: { stamps: {} } })
  }) as typeof fetch
  return { send, asked }
}

function Board({ send }: { send: typeof fetch }) {
  useBoardActions()
  return <PresentOverlay askThumbnails={send} />
}

function present(frames: FrameRecord[], send = quietSend().send) {
  const page = pageOf(frames)
  liveStore.setState({ board: boardOf(page) })
  render(<Board send={send} />)
  act(() => startPresenting(page))
}

const overview = () => screen.queryByRole('region', { name: 'Slide overview' })
const cells = () => within(overview() as HTMLElement).getAllByRole('button')
const cell = (number: number) =>
  within(overview() as HTMLElement).getByRole('button', {
    name: new RegExp(`^Slide ${number},`),
  })
const shown = () => presentStore.getState().frame

afterEach(() => {
  presentStore.setState({
    page: null,
    frame: null,
    leaving: null,
    overview: false,
  })
  selectionStore.setState({ page: null, frames: [] })
  liveStore.setState({
    board: null,
    thumbnails: { light: {}, dark: {} },
  })
})

describe('opening the overview', () => {
  it('opens on G with every slide and the current one marked', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('{ArrowRight}{ArrowRight}g')

    expect(cells()).toHaveLength(12)
    expect(cell(3).getAttribute('aria-current')).toBe('true')
    expect(cell(2).getAttribute('aria-current')).toBeNull()
  })

  it('badges the current slide Now and outlines only where the keys are', async () => {
    present(slidesOf('one', 'two', 'three'))
    await userEvent.keyboard('{ArrowRight}{ArrowRight}g{ArrowLeft}{ArrowLeft}')
    const thumbnail = (number: number) =>
      getComputedStyle(cell(number).firstElementChild as HTMLElement)

    expect(within(cell(3)).getByText('Now')).toBeVisible()
    expect(within(cell(1)).queryByText('Now')).toBeNull()
    expect(thumbnail(3).outlineStyle).toBe('none')
    expect(thumbnail(3).boxShadow).toBe('none')
    expect(thumbnail(1).boxShadow).not.toBe('none')
  })

  it('opens from the bar button', async () => {
    present(slidesOf('one', 'two'))

    await userEvent.click(
      screen.getByRole('button', { name: 'Slide overview' }),
    )

    expect(overview()).not.toBeNull()
  })

  it('moves focus onto the current slide', async () => {
    present(slidesOf('one', 'two', 'three'))
    await userEvent.keyboard('{ArrowRight}g')

    expect(document.activeElement).toBe(cell(2))
  })

  it('draws no cell for a hidden frame', async () => {
    present(slidesOf('one', 'hidden-draft', 'two'))
    await userEvent.keyboard('g')

    expect(cells().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Slide 1, one',
      'Slide 2, two',
    ])
  })

  it('opens with one cell on a page of one slide', async () => {
    present(slidesOf('only'))
    await userEvent.keyboard('g')

    expect(cells()).toHaveLength(1)
  })

  it('cuts a transition still playing, so the grid opens on its slide', async () => {
    const page = {
      ...pageOf(slidesOf('one', 'two')),
      transition: { name: 'fade', ms: 400 },
    }
    liveStore.setState({ board: boardOf(page) })
    render(<Board send={quietSend().send} />)
    act(() => startPresenting(page))
    act(() => stepPresenting(1))
    expect(presentStore.getState().leaving).not.toBeNull()

    await userEvent.keyboard('g')

    expect(presentStore.getState().leaving).toBeNull()
    expect(cell(2).getAttribute('aria-current')).toBe('true')
  })

  it('asks for the presented page in the board theme', async () => {
    const { send, asked } = quietSend()
    present(slidesOf('one', 'two'), send)

    await userEvent.keyboard('g')

    expect(asked).toEqual(['/api/thumbnails?theme=light&page=studio%2Fhome'])
  })

  it('draws a slide its thumbnail once its stamp is known', async () => {
    present(slidesOf('one', 'two'))
    act(() =>
      liveStore.setState({
        thumbnails: { light: { 'studio/home/one': 's1' }, dark: {} },
      }),
    )
    await userEvent.keyboard('g')

    expect(cell(1).querySelector('img')?.getAttribute('src')).toBe(
      '/api/thumbnails/png?ref=studio%2Fhome%2Fone&theme=light&v=s1',
    )
    expect(cell(2).querySelector('img')).toBeNull()
  })
})

describe('moving and jumping', () => {
  it('jumps to the slide the arrows reach on Enter, at its first step', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('g{ArrowRight}{ArrowRight}{ArrowRight}{Enter}')

    expect(overview()).toBeNull()
    expect(shown()).toBe('studio/home/slide-4')
    expect(presentStore.getState().step).toBe(0)
    expect(presentStore.getState().leaving).toBeNull()
  })

  it('moves Down to the slide under the cursor in the next row', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('g')
    const first = cell(1).getBoundingClientRect()

    await userEvent.keyboard('{ArrowDown}')

    const below = (
      document.activeElement as HTMLElement
    ).getBoundingClientRect()
    expect(below.left).toBeCloseTo(first.left)
    expect(below.top).toBeGreaterThan(first.bottom)
  })

  it('jumps to a typed number on Enter', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('g11{Enter}')

    expect(shown()).toBe('studio/home/slide-11')
  })

  it('stays open and moves nothing on a number past the last slide', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('{ArrowRight}g13{Enter}')

    expect(overview()).not.toBeNull()
    expect(shown()).toBe('studio/home/slide-2')
    expect(document.activeElement).toBe(cell(2))
  })

  it('jumps on a click as Enter does', async () => {
    present(slidesOf(...TWELVE))
    await userEvent.keyboard('g')

    await userEvent.click(cell(7))

    expect(overview()).toBeNull()
    expect(shown()).toBe('studio/home/slide-7')
  })
})

describe('closing the overview', () => {
  it('returns to the slide left on Esc, still presenting', async () => {
    present(slidesOf('one', 'two', 'three'))
    await userEvent.keyboard('{ArrowRight}g{ArrowRight}{Escape}')

    expect(overview()).toBeNull()
    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(shown()).toBe('studio/home/two')
  })

  it('returns focus to the bar button it opened from', async () => {
    present(slidesOf('one', 'two'))
    const button = screen.getByRole('button', { name: 'Slide overview' })
    await userEvent.click(button)

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).toBe(button)
  })

  it('keeps the slide beneath out of reach while open, and back once shut', async () => {
    present(slidesOf('one', 'two'))
    const stage = () =>
      screen.getByRole('dialog').querySelector('iframe')?.closest('[inert]')
    await userEvent.keyboard('g')

    expect(stage()).not.toBeNull()

    await userEvent.keyboard('{Escape}')

    expect(stage()).toBeNull()
  })

  it('steps the deck again once shut', async () => {
    present(slidesOf('one', 'two', 'three'))
    await userEvent.keyboard('gg{ArrowRight}')

    expect(overview()).toBeNull()
    expect(shown()).toBe('studio/home/two')
  })
})
