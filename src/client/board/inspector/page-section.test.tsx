import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { Transition } from '@/shared/present-transition'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { stopPreview } from '../present/preview'
import { notesShownStore } from '../speaker-notes/shown'
import { PageSection } from './page-section'

/** The bodies the section posts, answered as the server would answer a page. */
function recording() {
  const posted: { path: string; body: unknown }[] = []
  const send: typeof fetch = async (input, init) => {
    posted.push({
      path: String(input),
      body: JSON.parse(String(init?.body ?? 'null')),
    })
    return Response.json({ ok: true, data: pageOf([]) })
  }
  return { posted, calls: createStructure(send) }
}

/** Mounts the section on a page of a project holding `own` transitions of its own. */
function mount(transition?: Transition, own: string[] = []) {
  const { posted, calls } = recording()
  const page = { ...pageOf([]), ...(transition ? { transition } : {}) }
  const board = boardOf(page)
  liveStore.setState({
    board: {
      ...board,
      projects: board.projects.map((project) => ({
        ...project,
        transitions: own,
      })),
    },
  })
  render(<PageSection page={page} calls={calls} />)
  return posted
}

const pick = async (item: string) => {
  await userEvent.click(screen.getByRole('radio', { name: item }))
}

const tiles = () => screen.getByRole('radiogroup', { name: 'Slide transition' })

beforeEach(() => {
  liveStore.setState({ canWrite: true })
})

afterEach(() => {
  liveStore.setState({ canWrite: false, board: null })
})

describe('the Page section', () => {
  it('describes Slide transition with what the board draws', () => {
    mount()

    expect(tiles()).toHaveAccessibleDescription(
      'Drawn by the board while presenting. Slide files are unchanged.',
    )
  })

  it('reads None and offers no duration for a page with no transition', () => {
    mount()

    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(
      'None',
    )
    expect(screen.queryByRole('button', { name: 'Duration' })).toBeNull()
  })

  it('writes the picked transition for the page', async () => {
    const posted = mount()

    await pick('Fade')

    expect(posted).toEqual([
      {
        path: '/api/page/transition',
        body: { ref: 'studio/home', transition: { name: 'fade' } },
      },
    ])
  })

  it('keeps the duration when the transition changes', async () => {
    const posted = mount({ name: 'fade', ms: 300 })

    await pick('Zoom')

    expect(posted[0]?.body).toEqual({
      ref: 'studio/home',
      transition: { name: 'zoom', ms: 300 },
    })
  })

  it('drops a direction once the transition takes none', async () => {
    const posted = mount({ name: 'push', direction: 'up' })

    await pick('Fade')

    expect(posted[0]?.body).toEqual({
      ref: 'studio/home',
      transition: { name: 'fade' },
    })
  })

  it('offers Direction for Slide alone of these', () => {
    mount({ name: 'slide' })

    expect(screen.getByRole('button', { name: 'Direction' })).toHaveTextContent(
      'Left',
    )
  })

  it("tiles the project's own after the built-ins, each as written", () => {
    mount(undefined, ['curtain', 'wipe-up'])

    const items = screen.getAllByRole('radio')

    expect(items.map((item) => item.textContent)).toEqual([
      'None',
      'Fade',
      'Slide',
      'Push',
      'Zoom',
      'Flip',
      'Dissolve',
      'curtain',
      'wipe-up',
    ])
  })

  it('writes a picked own transition by its name, dropping a direction', async () => {
    const posted = mount({ name: 'push', direction: 'up', ms: 300 }, [
      'wipe-up',
    ])

    await pick('wipe-up')

    expect(posted[0]?.body).toEqual({
      ref: 'studio/home',
      transition: { name: 'wipe-up', ms: 300 },
    })
  })

  it('shows an own transition as the current value, with a duration and no direction', () => {
    mount({ name: 'wipe-up' }, ['wipe-up'])

    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(
      'wipe-up',
    )
    expect(screen.getByRole('button', { name: 'Duration' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Direction' })).toBeNull()
  })

  it('clears the transition on None', async () => {
    const posted = mount({ name: 'fade' })

    await pick('None')

    expect(posted[0]?.body).toEqual({ ref: 'studio/home', transition: null })
  })

  it('writes nothing on hovering a tile', async () => {
    const posted = mount({ name: 'fade' })

    await userEvent.hover(screen.getByRole('radio', { name: 'Push' }))

    expect(posted).toEqual([])
  })
})

describe('a hovered page tile', () => {
  /** A selected slide's live iframe on the canvas, as the board draws one. */
  function slideOnCanvas(ref: string): HTMLIFrameElement {
    const frame = document.createElement('div')
    frame.dataset.frame = ref
    const iframe = document.createElement('iframe')
    frame.append(iframe)
    document.body.append(frame)
    return iframe
  }

  afterEach(() => {
    stopPreview()
    document.querySelectorAll('[data-frame]').forEach((frame) => frame.remove())
  })

  it('plays on the selected slide, and leaving the tile restores it', async () => {
    const iframe = slideOnCanvas('studio/home/hero')
    const page = pageOf([frameOf('hero')])
    liveStore.setState({ board: boardOf(page) })
    render(<PageSection page={page} selected={['studio/home/hero']} />)
    const push = screen.getByRole('radio', { name: 'Push' })

    await userEvent.hover(push)
    const played = iframe.style.animationName
    await userEvent.unhover(push)

    expect([played, iframe.getAttribute('style')]).toEqual([
      'fb-present-push-enter, fb-preview-clip',
      '',
    ])
  })

  it('leaves the canvas alone with no slide selected', async () => {
    const iframe = slideOnCanvas('studio/home/hero')
    const page = pageOf([frameOf('hero')])
    liveStore.setState({ board: boardOf(page) })
    render(<PageSection page={page} />)

    await userEvent.hover(screen.getByRole('radio', { name: 'Push' }))

    expect(iframe.getAttribute('style')).toBeNull()
  })
})

describe('the Notes button', () => {
  afterEach(() => {
    notesShownStore.setState({ shown: false })
  })

  it('reads Notes hidden, not pressed, and shows every note on a press', async () => {
    mount()

    await userEvent.click(
      screen.getByRole('button', { name: 'Notes hidden', pressed: false }),
    )

    expect(
      screen.getByRole('button', { name: 'Notes shown', pressed: true }),
    ).toBeVisible()
    expect(notesShownStore.getState().shown).toBe(true)
  })

  it('reads Notes shown, pressed, and hides every note on a press', async () => {
    notesShownStore.setState({ shown: true })
    mount()

    await userEvent.click(
      screen.getByRole('button', { name: 'Notes shown', pressed: true }),
    )

    expect(notesShownStore.getState().shown).toBe(false)
  })

  it('works in a reader tab, since it writes no file', async () => {
    liveStore.setState({ canWrite: false })
    mount()

    await userEvent.click(screen.getByRole('button', { name: 'Notes hidden' }))

    expect(notesShownStore.getState().shown).toBe(true)
  })
})
