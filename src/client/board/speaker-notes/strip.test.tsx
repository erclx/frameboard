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
import { notesShownStore } from './shown'
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

/** A send answering every write as the server refuses a note an agent changed meanwhile. */
const refusing: typeof fetch = async () =>
  Response.json(
    {
      ok: false,
      error: {
        code: 'stale-layout',
        message: 'The speaker notes changed since this edit began.',
      },
    },
    { status: 409 },
  )

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
  notesShownStore.setState({ shown: true })
})

afterEach(() => {
  act(() => {
    clear(selectionStore)
    inspectorTabStore.setState({ tab: 'design' })
    notesShownStore.setState({ shown: false })
    liveStore.setState({ canWrite: false })
  })
})

describe('the speaker notes strip', () => {
  it('writes a typed note once, on blur', async () => {
    const posted = mount([frameOf('slide')])

    await userEvent.type(notes(), 'Open on the price.')
    await userEvent.tab()

    expect(posted).toEqual([
      { ref: SLIDE, speakerNotes: 'Open on the price.', expected: '' },
    ])
  })

  it('keeps line breaks and writes on Ctrl+Enter', async () => {
    const posted = mount([frameOf('slide')])

    await userEvent.type(
      notes(),
      'Open on it.{Shift>}{Enter}{/Shift}Then demo.',
    )
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(posted).toEqual([
      { ref: SLIDE, speakerNotes: 'Open on it.\nThen demo.', expected: '' },
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

    expect(posted).toEqual([
      { ref: SLIDE, speakerNotes: '', expected: 'Stored.' },
    ])
  })

  it('bases a second edit on the note this tab just wrote', async () => {
    const posted = mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    await userEvent.type(notes(), ' Typed.')
    await userEvent.tab()
    await userEvent.type(notes(), ' More.')
    await userEvent.tab()

    expect(posted).toEqual([
      { ref: SLIDE, speakerNotes: 'Stored. Typed.', expected: 'Stored.' },
      {
        ref: SLIDE,
        speakerNotes: 'Stored. Typed. More.',
        expected: 'Stored. Typed.',
      },
    ])
  })

  it('keeps the draft in the field when the write is refused as stale', async () => {
    render(
      <SpeakerNotesStrip
        frames={[frameOf('slide', { speakerNotes: 'Stored.' })]}
        calls={createStructure(refusing)}
      />,
    )

    await userEvent.type(notes(), ' Typed.')
    await userEvent.tab()

    await expect.poll(() => notes()).toHaveValue('Stored. Typed.')
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

  it('says a reader tab the slide holds no note', () => {
    liveStore.setState({ canWrite: false })

    mount([frameOf('slide')])

    expect(notes()).toHaveAttribute(
      'placeholder',
      'No speaker notes on this slide',
    )
  })

  it('offers a writer an empty field to write in', () => {
    mount([frameOf('slide')])

    expect(notes()).toHaveAttribute(
      'placeholder',
      'What you’ll say over this slide',
    )
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
})

describe('which slides draw a strip', () => {
  it('draws one under every slide while notes are shown, none selected', () => {
    mount([
      frameOf('one', { speakerNotes: 'Open on it.' }),
      frameOf('two'),
      frameOf('three', { speakerNotes: 'Close on it.' }),
    ])

    expect(
      screen
        .getAllByRole('textbox', { name: 'Speaker notes' })
        .map((field) => (field as HTMLTextAreaElement).value),
    ).toEqual(['Open on it.', '', 'Close on it.'])
  })

  it('draws none while notes are hidden, a selected slide on the Slides tab included', () => {
    notesShownStore.setState({ shown: false })
    inspectorTabStore.setState({ tab: 'slides' })
    select(selectionStore, 'studio/home', [SLIDE])

    mount([frameOf('slide', { speakerNotes: 'Stored.' })])

    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('draws every strip once notes are shown after mounting hidden', () => {
    notesShownStore.setState({ shown: false })
    mount([frameOf('one'), frameOf('two')])

    act(() => notesShownStore.setState({ shown: true }))

    expect(
      screen.getAllByRole('textbox', { name: 'Speaker notes' }),
    ).toHaveLength(2)
  })

  it('keeps a draft in one strip while another slide changes', async () => {
    const { calls } = recording()
    const { rerender } = render(
      <SpeakerNotesStrip
        frames={[frameOf('one'), frameOf('two')]}
        calls={calls}
      />,
    )
    const [first] = screen.getAllByRole('textbox', { name: 'Speaker notes' })
    await userEvent.type(first as HTMLElement, 'Half a thought')

    rerender(
      <SpeakerNotesStrip
        frames={[
          frameOf('one'),
          frameOf('two', { speakerNotes: 'Agent wrote.' }),
        ]}
        calls={calls}
      />,
    )

    expect(first).toHaveFocus()
    expect(first).toHaveValue('Half a thought')
  })
})
