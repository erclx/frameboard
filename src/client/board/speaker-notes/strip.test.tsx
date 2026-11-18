import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { inspectorTabStore } from '../inspector/tab-store'
import { clear, select, selectionStore } from '../selection'
import { SpeakerNotesStrip } from './strip'

const SLIDE = 'studio/home/slide'

/** The bodies the strip posts, answered as the server answers a frame. */
function recording() {
  const posted: unknown[] = []
  const send: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? 'null'))
    posted.push(body)
    return Response.json({ ok: true, data: frameOf('slide') })
  }
  return { posted, calls: createStructure(send) }
}

function mount(
  frames: FrameRecord[],
  { claims }: { claims?: Record<string, Claim> } = {},
) {
  const { posted, calls } = recording()
  render(<SpeakerNotesStrip frames={frames} claims={claims} calls={calls} />)
  return posted
}

const notes = () => screen.getByRole('textbox', { name: 'Speaker notes' })

beforeEach(() => {
  liveStore.setState({ canWrite: true })
  inspectorTabStore.setState({ tab: 'slides' })
  select(selectionStore, 'studio/home', [SLIDE])
})

afterEach(() => {
  act(() => {
    clear(selectionStore)
    inspectorTabStore.setState({ tab: 'design' })
    liveStore.setState({ canWrite: false })
  })
})

describe('the speaker notes strip', () => {
  it('writes a typed note once, on blur', async () => {
    const posted = mount([frameOf('slide')])

    await userEvent.type(notes(), 'Open on the price.')
    await userEvent.tab()

    expect(posted).toEqual([{ ref: SLIDE, speakerNotes: 'Open on the price.' }])
  })

  it('keeps line breaks and writes on Ctrl+Enter', async () => {
    const posted = mount([frameOf('slide')])

    await userEvent.type(
      notes(),
      'Open on it.{Shift>}{Enter}{/Shift}Then demo.',
    )
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(posted).toEqual([
      { ref: SLIDE, speakerNotes: 'Open on it.\nThen demo.' },
    ])
    expect(notes()).not.toHaveFocus()
  })

  it('puts the stored note back on Escape and writes nothing', async () => {
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    await userEvent.type(notes(), ' Typed.')
    await userEvent.keyboard('{Escape}')

    expect(notes()).toHaveValue('Stored.')
    expect(posted).toEqual([])
  })

  it('writes empty text to clear a note', async () => {
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    await userEvent.clear(notes())
    await userEvent.tab()

    expect(posted).toEqual([{ ref: SLIDE, speakerNotes: '' }])
  })

  it('writes nothing on blur when the note is unchanged', async () => {
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    await userEvent.click(notes())
    await userEvent.tab()

    expect(posted).toEqual([])
  })

  it('shows the note to a reader tab and takes no typing', async () => {
    liveStore.setState({ canWrite: false })
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    await userEvent.type(notes(), ' Typed.')
    await userEvent.tab()

    expect(notes()).toHaveValue('Stored.')
    expect(posted).toEqual([])
  })

  it('turns off on a held frame and says who holds it', async () => {
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })], {
      claims: {
        [SLIDE]: {
          frame: SLIDE,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: '2026-11-18T00:00:00.000Z',
          expiresAt: '2026-11-18T01:00:00.000Z',
        },
      },
    })

    await userEvent.type(notes(), ' Typed.')

    expect(notes()).toHaveValue('Stored.')
    expect(notes()).toHaveAccessibleDescription(
      'only you see these claude · studio is editing slide, so notes are off.',
    )
    expect(posted).toEqual([])
  })

  it('refuses a note past the limit, saying so, and writes nothing', async () => {
    const posted = mount([frameOf('slide')])

    await userEvent.click(notes())
    await userEvent.paste('a'.repeat(10_001))
    await userEvent.tab()

    expect(notes()).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText(/at most 10,000 characters, and these have 10,001/),
    ).toBeVisible()
    expect(posted).toEqual([])
  })

  it('shows no strip on the Design tab while the slide holds no note', () => {
    inspectorTabStore.setState({ tab: 'design' })

    mount([frameOf('slide')])

    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the strip on the Design tab once the slide holds a note', () => {
    inspectorTabStore.setState({ tab: 'design' })

    mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    expect(notes()).toHaveValue('Stored.')
  })

  it('shows no strip while several frames are selected', () => {
    select(selectionStore, 'studio/home', [SLIDE, 'studio/home/other'])

    mount([frameOf('slide'), frameOf('other')])

    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
