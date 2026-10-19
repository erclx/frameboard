import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote, Listener } from '@/shared/records/notes'

import { modeStore } from '../mode'
import { Composer } from './composer'
import { NotesLayer } from './markers'
import type { NotePick } from './pick'
import { Thread } from './thread'

const PICK: NotePick = {
  frame: { ref: 'studio/home/hero', name: 'hero' },
  element: null,
  renderedAt: null,
  at: { x: 10, y: 10 },
}

function listener(session: string, tag = `claude · ${session}`): Listener {
  return { session, tag, since: '2026-10-19T10:00:00.000Z' }
}

function note(fields: Partial<BoardNote> & Pick<BoardNote, 'id'>): BoardNote {
  return {
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'Tighten the header',
    from: 'developer',
    author: 'Ada Lovelace',
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: '2026-10-19T16:12:00.000Z',
    updatedAt: '2026-10-19T16:12:00.000Z',
    element: null,
    ...fields,
  }
}

const HERO: FrameRecord = {
  ref: 'studio/home/hero',
  project: 'studio',
  page: 'home',
  name: 'hero',
  path: '/board/studio/home/hero.html',
  box: { x: 0, y: 0, width: 390, height: 844 },
  order: 0,
  hidden: false,
  locked: false,
  placed: true,
  modifiedAt: '2026-10-15T00:00:00.000Z',
}

function live(state: Partial<ReturnType<typeof liveStore.getState>>): void {
  act(() => liveStore.setState(state))
}

afterEach(() => {
  act(() => {
    liveStore.setState({ canWrite: false, listeners: [], notes: {} })
    modeStore.setState({ mode: 'edit', tool: 'move' })
  })
})

describe('Composer', () => {
  it('says no session is listening and holds Send', () => {
    live({ canWrite: true })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(screen.getByText('No session listening')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('picks the only listening session', () => {
    live({ canWrite: true, listeners: [listener('a', 'claude · frameboard')] })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(screen.getByText('1 listening')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Send to' }),
    ).toHaveDisplayValue('claude · frameboard')
  })

  it('waits on a pick among several listening sessions', async () => {
    live({ canWrite: true, listeners: [listener('a'), listener('b')] })
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pick a session to send it to',
    )
  })

  it('asks for the text before saving an empty note', async () => {
    live({ canWrite: true })
    render(<Composer pick={PICK} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Write the note first')
  })

  it('reads disabled in a tab that cannot write', () => {
    live({ canWrite: false, listeners: [listener('a')] })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('names the frame it pins to', () => {
    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(
      screen.getByRole('region', { name: 'New note on hero' }),
    ).toBeInTheDocument()
  })
})

describe('Thread', () => {
  const thread = [
    note({ id: 'n_1', number: 2 }),
    note({
      id: 'n_2',
      number: null,
      thread: 'n_1',
      from: 'agent',
      author: null,
      text: 'Done. The third chip reads --accent now.',
    }),
  ]

  it("shows the developer's and the agent's messages in order", () => {
    render(<Thread notes={thread} onClose={() => {}} />)

    const messages = screen.getAllByRole('listitem')
    expect(screen.getByRole('region', { name: 'Note 2' })).toBeInTheDocument()
    expect(messages[0]).toHaveTextContent('You')
    expect(messages[0]).toHaveTextContent('Tighten the header')
    expect(messages[1]).toHaveTextContent('claude')
    expect(messages[1]).toHaveTextContent('Done. The third chip')
  })

  it('signs a developer message with its author initials', () => {
    render(<Thread notes={thread} onClose={() => {}} />)

    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('AL')
  })

  it('asks for a reply when Send has nothing to send', async () => {
    live({ canWrite: true })
    render(<Thread notes={thread} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Write a reply first')
  })

  it('reads disabled in a tab that cannot write', () => {
    live({ canWrite: false, listeners: [listener('a')] })

    render(<Thread notes={thread} onClose={() => {}} />)

    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('closes on Esc', async () => {
    live({ canWrite: true })
    let closed = false
    render(<Thread notes={thread} onClose={() => (closed = true)} />)

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      '{Escape}',
    )

    expect(closed).toBe(true)
  })
})

describe('NotesLayer', () => {
  function renderLayer() {
    return render(
      <NotesLayer page="studio/home" frames={[HERO]} container={null} />,
    )
  }

  it('draws one numbered marker per open note', () => {
    live({
      notes: {
        'studio/home': [
          note({ id: 'n_1', number: 1 }),
          note({ id: 'n_2', number: 2, state: 'done' }),
          note({ id: 'n_3', number: null, thread: 'n_1' }),
        ],
      },
    })

    renderLayer()

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['1'])
  })

  it('draws a frame note at its frame top right corner', () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })

    renderLayer()

    expect(screen.getByRole('button', { name: 'Note 1 on hero' })).toHaveStyle({
      left: '390px',
      top: '0px',
    })
  })

  it('hides every marker in Play', () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })
    act(() => modeStore.setState({ mode: 'play' }))

    renderLayer()

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the thread of a marker clicked', async () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1', number: 4 })] } })
    renderLayer()

    await userEvent.click(
      screen.getByRole('button', { name: 'Note 4 on hero' }),
    )

    expect(screen.getByRole('region', { name: 'Note 4' })).toBeInTheDocument()
  })
})
