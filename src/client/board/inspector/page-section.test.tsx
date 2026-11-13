import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { Transition } from '@/shared/present-transition'
import { pageOf } from '@/test/board'

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

function mount(transition?: Transition) {
  const { posted, calls } = recording()
  const page = { ...pageOf([]), ...(transition ? { transition } : {}) }
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
  liveStore.setState({ canWrite: false })
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

  it('clears the transition on None', async () => {
    const posted = mount({ name: 'fade' })

    await pick('Slide transition', 'None')

    expect(posted[0]?.body).toEqual({ ref: 'studio/home', transition: null })
  })
})
