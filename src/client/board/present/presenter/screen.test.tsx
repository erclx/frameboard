import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { themeStore } from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { bridgeIn } from '@/test/frame-bridge'

import { presentStore } from '../store'
import { type PresentedState, serveAudience } from '../sync'
import { PresenterScreen } from './screen'

const ID = 'presenter-screen-test'
const STARTED = 1_700_000_000_000

/** One row of slides, laid left to right in the order named, each holding the note given. */
function slidesOf(notes: Record<string, string | undefined>): FrameRecord[] {
  return Object.entries(notes).map(([name, speakerNotes], at) =>
    frameOf(name, {
      box: { x: at * 500, y: 0, width: 390, height: 844 },
      ...(speakerNotes === undefined ? {} : { speakerNotes }),
    }),
  )
}

function presented(patch: Partial<PresentedState> = {}): PresentedState {
  return {
    page: 'studio/home',
    frame: 'studio/home/first',
    step: 0,
    startedAt: STARTED,
    themes: {},
    ...patch,
  }
}

const ends: (() => void)[] = []

afterEach(() => {
  for (const end of ends.splice(0)) end()
  presentStore.setState({ page: null, frame: null, step: 0, steps: 0 })
  themeStore.setState({ flipped: new Set() })
  liveStore.setState({ board: null })
})

/** Shows `frames` on the board, then plays the audience with `state` and renders the window. */
function open(
  frames: FrameRecord[],
  state: PresentedState | null = presented(),
  read: () => number = () => STARTED + 252_000,
) {
  liveStore.setState({ board: boardOf(pageOf(frames)) })
  const step = vi.fn<(by: 1 | -1) => void>()
  const leave = vi.fn<() => void>()
  let current = state
  const audience = serveAudience(ID, { current: () => current, step, leave })
  ends.push(() => audience.end())
  render(<PresenterScreen id={ID} read={read} />)
  const send = (next: PresentedState) => {
    current = next
    act(() => audience.send(next))
  }
  return { step, leave, send, end: () => act(() => audience.end()) }
}

const region = (name: string) => screen.getByRole('region', { name })
const slideIn = (name: string) =>
  region(name).querySelector<HTMLIFrameElement>('iframe')

/**
 * The loaded document of the slide in region `name`, once it is the frame's
 * own, with the bridge the frame route would inject.
 */
async function documentIn(name: string): Promise<Document> {
  const { iframe, doc } = await vi.waitFor(() => {
    const iframe = slideIn(name)
    const doc = iframe?.contentDocument
    if (
      !iframe ||
      !doc ||
      doc.URL === 'about:blank' ||
      doc.readyState !== 'complete'
    ) {
      throw new Error(`${name} is still loading`)
    }
    return { iframe, doc }
  })
  await bridgeIn(iframe)
  return doc
}

const STEPPED = '<p id="a" data-step="1">One</p><p id="b" data-step="2">Two</p>'

const shows = (doc: Document, id: string) =>
  getComputedStyle(doc.getElementById(id) as Element).visibility

describe('before the audience answers', () => {
  it('says it waits on the presenting tab', () => {
    open(slidesOf({ first: undefined }), null)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for the presenting tab',
    )
  })

  it('says presenting ended with no presentation in its address', () => {
    liveStore.setState({ board: boardOf(pageOf(slidesOf({ first: '' }))) })

    render(<PresenterScreen id={null} />)

    expect(screen.getByRole('status')).toHaveTextContent('Presenting ended')
  })
})

describe('a fed state', () => {
  it('draws the slide now, the next slide, the count, and the notes', async () => {
    open(slidesOf({ first: 'Open on the problem.', second: undefined }))

    await expect.poll(() => slideIn('Now')?.title).toBe('first')
    expect(slideIn('Next')?.title).toBe('second')
    expect(screen.getByText('Slide 1 of 2')).toBeInTheDocument()
    expect(region('Speaker notes')).toHaveTextContent('Open on the problem.')
  })

  it('times from the start the audience sent', async () => {
    open(slidesOf({ first: undefined }))

    expect(
      await screen.findByRole('button', { name: /reset the timer/ }),
    ).toHaveTextContent('04:12')
  })

  it('resets the timer to zero on a press', async () => {
    let now = STARTED + 252_000
    open(slidesOf({ first: undefined }), presented(), () => now)
    const timer = await screen.findByRole('button', { name: /reset the timer/ })

    await userEvent.click(timer)
    now += 5_000

    // The timer turns over on the next whole second, so the settle outlasts one.
    await expect
      .poll(() => timer.textContent, { timeout: 3_000 })
      .toMatch(/^00:05/)
  })

  it('reads End of deck past the last slide', async () => {
    open(
      slidesOf({ first: undefined, second: undefined }),
      presented({ frame: 'studio/home/second' }),
    )

    await expect.poll(() => slideIn('Now')?.title).toBe('second')
    expect(within(region('Next')).getByText('End of deck')).toBeInTheDocument()
    expect(slideIn('Next')).toBeNull()
  })

  it('draws End of deck in the shape a slide takes there', async () => {
    open(
      slidesOf({ first: undefined, second: undefined }),
      presented({ frame: 'studio/home/second' }),
    )

    const next = await screen.findByRole('region', { name: 'Next' })
    const end = within(next).getByText('End of deck')
    const { width, height } = end.getBoundingClientRect()

    // Each slide is 390 by 844, so the card keeps that shape.
    expect(width / height).toBeCloseTo(390 / 844, 2)
  })

  it('says a slide holds no note, keeping the notes in place', async () => {
    open(slidesOf({ first: undefined }))

    await expect
      .poll(() => region('Speaker notes').textContent)
      .toBe('No speaker note on this slide.')
  })

  it('follows the audience to the next slide', async () => {
    const { send } = open(slidesOf({ first: 'One', second: 'Two' }))
    await expect.poll(() => slideIn('Now')?.title).toBe('first')

    send(presented({ frame: 'studio/home/second' }))

    await expect.poll(() => slideIn('Now')?.title).toBe('second')
    expect(region('Speaker notes')).toHaveTextContent('Two')
  })

  it('draws a frame flipped in the audience tab flipped here', async () => {
    themeStore.setState({ choice: 'light' })
    open(
      slidesOf({ first: undefined }),
      presented({ themes: { 'studio/home/first': 'dark' } }),
    )

    await expect.poll(() => slideIn('Now')?.style.colorScheme).toBe('dark')
  })
})

describe('steps', () => {
  it('shows the slide now at the step the audience sent, with its dots', async () => {
    open(slidesOf({ first: undefined }), presented({ step: 1 }))
    const doc = await documentIn('Now')

    doc.body.innerHTML = STEPPED

    expect(
      await screen.findByRole('img', { name: 'Step 1 of 2' }),
    ).toBeInTheDocument()
    expect(shows(doc, 'a')).toBe('visible')
    expect(shows(doc, 'b')).toBe('hidden')
  })

  it('plays no clip as the audience’s press reveals it', async () => {
    const { send } = open(slidesOf({ first: undefined }))
    const doc = await documentIn('Now')
    doc.body.innerHTML =
      '<video id="a" muted data-step="1" data-step-play></video>'
    await screen.findByRole('img', { name: 'Step 0 of 1' })

    send(presented({ step: 1 }))

    await expect.poll(() => shows(doc, 'a')).toBe('visible')
    expect(doc.querySelector('video')?.paused).toBe(true)
  })

  it('shows the next slide at its first step', async () => {
    open(slidesOf({ first: undefined, second: undefined }))
    const doc = await documentIn('Next')

    doc.body.innerHTML = STEPPED

    await expect.poll(() => shows(doc, 'a')).toBe('hidden')
    expect(presentStore.getState().steps).toBe(0)
  })
})

describe('a press', () => {
  it('steps the audience either way', async () => {
    const { step } = open(slidesOf({ first: undefined }))
    await screen.findByRole('region', { name: 'Now' })

    await userEvent.keyboard('{ArrowRight}{ArrowLeft}[Space]')

    await expect.poll(() => step.mock.calls).toEqual([[1], [-1], [1]])
  })

  it('leaves the scrolling keys to a focused note, and Right still steps', async () => {
    const { step } = open(slidesOf({ first: 'A long note.' }))
    const notes = await screen.findByRole('region', { name: 'Speaker notes' })
    notes.focus()

    await userEvent.keyboard('{ArrowDown}{PageDown}{ArrowRight}')

    await expect.poll(() => step.mock.calls).toEqual([[1]])
  })

  it('leaves presenting on Esc', async () => {
    const { leave } = open(slidesOf({ first: undefined }))
    await screen.findByRole('region', { name: 'Now' })

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => leave.mock.calls.length).toBe(1)
  })

  it('keeps every key from the board bindings', async () => {
    const board = vi.fn()
    window.addEventListener('keydown', board)
    open(slidesOf({ first: undefined }))
    await screen.findByRole('region', { name: 'Now' })

    await userEvent.keyboard('z{ArrowRight}k')

    window.removeEventListener('keydown', board)
    expect(board).not.toHaveBeenCalled()
  })
})

describe('the audience leaving', () => {
  it('shows that presenting ended rather than the last slide', async () => {
    const { end } = open(slidesOf({ first: undefined }))
    await screen.findByRole('region', { name: 'Now' })

    end()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Presenting ended',
    )
    expect(screen.queryByRole('region', { name: 'Now' })).toBeNull()
  })
})
