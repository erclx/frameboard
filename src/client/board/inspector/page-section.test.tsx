import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { Transition } from '@/shared/present-transition'
import { boardOf, pageOf } from '@/test/board'

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

const pick = async (menu: string, item: string) => {
  await userEvent.click(screen.getByRole('button', { name: menu }))
  await userEvent.click(
    await screen.findByRole('menuitemradio', { name: item }),
  )
}

beforeEach(() => {
  liveStore.setState({ canWrite: true })
})

afterEach(() => {
  liveStore.setState({ canWrite: false, board: null })
})

describe('the Page section', () => {
  it('reads None and offers no duration for a page with no transition', () => {
    mount()

    expect(
      screen.getByRole('button', { name: 'Slide transition' }),
    ).toHaveTextContent('None')
    expect(screen.queryByRole('button', { name: 'Duration' })).toBeNull()
  })

  it('writes the picked transition for the page', async () => {
    const posted = mount()

    await pick('Slide transition', 'Fade')

    expect(posted).toEqual([
      {
        path: '/api/page/transition',
        body: { ref: 'studio/home', transition: { name: 'fade' } },
      },
    ])
  })

  it('keeps the duration when the transition changes', async () => {
    const posted = mount({ name: 'fade', ms: 300 })

    await pick('Slide transition', 'Zoom')

    expect(posted[0]?.body).toEqual({
      ref: 'studio/home',
      transition: { name: 'zoom', ms: 300 },
    })
  })

  it('drops a direction once the transition takes none', async () => {
    const posted = mount({ name: 'push', direction: 'up' })

    await pick('Slide transition', 'Fade')

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

  it("lists the project's own after the built-ins, each as written", async () => {
    mount(undefined, ['curtain', 'wipe-up'])

    await userEvent.click(
      screen.getByRole('button', { name: 'Slide transition' }),
    )
    const items = await screen.findAllByRole('menuitemradio')

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

    await pick('Slide transition', 'wipe-up')

    expect(posted[0]?.body).toEqual({
      ref: 'studio/home',
      transition: { name: 'wipe-up', ms: 300 },
    })
  })

  it('shows an own transition as the current value, with a duration and no direction', () => {
    mount({ name: 'wipe-up' }, ['wipe-up'])

    expect(
      screen.getByRole('button', { name: 'Slide transition' }),
    ).toHaveTextContent('wipe-up')
    expect(screen.getByRole('button', { name: 'Duration' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Direction' })).toBeNull()
  })

  it('clears the transition on None', async () => {
    const posted = mount({ name: 'fade' })

    await pick('Slide transition', 'None')

    expect(posted[0]?.body).toEqual({ ref: 'studio/home', transition: null })
  })
})
