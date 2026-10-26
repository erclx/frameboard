import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote, Listener } from '@/shared/records/notes'
import { contrastOnPage } from '@/test/contrast'

import { modeStore } from '../mode'
import { endPreview, setPreview } from '../preview/store'
import { Composer } from './composer'
import { NotesLayer } from './markers'
import type { NotePick } from './pick'
import { Thread } from './thread'
import { notesUi, useNoteTool } from './tool'

const PICK: NotePick = {
  frame: { ref: 'studio/home/hero', name: 'hero' },
  element: null,
  renderedAt: null,
  at: { x: 10, y: 10 },
}

function listener(session: string, tag = `claude · ${session}`): Listener {
  return { session, tag, since: '2026-10-19T10:00:00.000Z' }
}

function claimBy(session: string): Claim {
  return {
    frame: 'studio/home/hero',
    session,
    agent: 'codex',
    tag: 'codex · frameboard',
    claimedAt: '2026-10-19T10:00:00.000Z',
    expiresAt: '2026-10-19T10:05:00.000Z',
  }
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
  hugWidth: false,
  hugHeight: false,
  placed: true,
  modifiedAt: '2026-10-15T00:00:00.000Z',
}

function live(state: Partial<ReturnType<typeof liveStore.getState>>): void {
  act(() => liveStore.setState(state))
}

afterEach(() => {
  act(() => {
    liveStore.setState({
      canWrite: false,
      dispatch: false,
      listeners: [],
      notes: {},
      claims: {},
    })
    modeStore.setState({ mode: 'edit', tool: 'move' })
    notesUi.setState({ open: null, drafts: {} })
  })
  vi.unstubAllGlobals()
})

/** The board answering every write with `envelope`. */
function boardAnswering(envelope: unknown): void {
  vi.stubGlobal('fetch', async () => Response.json(envelope))
}

/** The board answering every write with an empty success, keeping each path and body it was sent. */
function boardRecording(): { path: string; body: unknown }[] {
  const sent: { path: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, body: JSON.parse(String(init.body)) })
    return Response.json({ ok: true, data: {} })
  })
  return sent
}

describe('Composer', () => {
  it('says no session is listening and holds Send', () => {
    live({ canWrite: true })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(screen.getByText('No session listening')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  describe('when serve can start a session', () => {
    it('starts on New session with Send enabled when nobody listens', () => {
      live({ canWrite: true, dispatch: true })

      render(<Composer pick={PICK} onClose={() => {}} />)

      expect(
        screen.getByRole('combobox', { name: 'Send to' }),
      ).toHaveDisplayValue('New session')
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })

    it('sends to New session by asking the board to start one', async () => {
      live({ canWrite: true, dispatch: true })
      const sent = boardRecording()
      render(<Composer pick={PICK} onClose={() => {}} />)
      await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

      await userEvent.click(screen.getByRole('button', { name: 'Send' }))

      expect(sent).toEqual([
        {
          path: '/api/notes',
          body: {
            frame: 'studio/home/hero',
            text: 'Warmer sky',
            dispatch: true,
          },
        },
      ])
    })

    it('keeps the only listener picked and offers New session after it', () => {
      live({
        canWrite: true,
        dispatch: true,
        listeners: [listener('a', 'claude · frameboard')],
      })

      render(<Composer pick={PICK} onClose={() => {}} />)

      const picker = screen.getByRole('combobox', { name: 'Send to' })
      expect(picker).toHaveDisplayValue('claude · frameboard')
      expect(
        screen.getAllByRole('option').map((option) => option.textContent),
      ).toEqual(['claude · frameboard', 'New session'])
    })

    it('sends to a listener picked over New session by naming it', async () => {
      live({ canWrite: true, dispatch: true, listeners: [listener('a')] })
      const sent = boardRecording()
      render(<Composer pick={PICK} onClose={() => {}} />)
      await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

      await userEvent.click(screen.getByRole('button', { name: 'Send' }))

      expect(sent[0]?.body).toMatchObject({ to: 'a' })
      expect(sent[0]?.body).not.toHaveProperty('dispatch')
    })
  })

  it('picks the only listening session', () => {
    live({ canWrite: true, listeners: [listener('a', 'claude · frameboard')] })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(screen.getByText('1 listening')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Send to' }),
    ).toHaveDisplayValue('claude · frameboard')
  })

  it('picks the listening session holding the frame claim among several', () => {
    live({
      canWrite: true,
      listeners: [listener('a'), listener('b', 'codex · frameboard')],
      claims: { 'studio/home/hero': claimBy('b') },
    })

    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(
      screen.getByRole('combobox', { name: 'Send to' }),
    ).toHaveDisplayValue('codex · frameboard')
  })

  it('falls back to the only listener when the claim holder is not listening', () => {
    live({
      canWrite: true,
      listeners: [listener('a', 'claude · frameboard')],
      claims: { 'studio/home/hero': claimBy('b') },
    })

    render(<Composer pick={PICK} onClose={() => {}} />)

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

  it('returns to Move once a note is sent', async () => {
    live({ canWrite: true, listeners: [listener('a')] })
    act(() => modeStore.setState({ tool: 'note' }))
    boardAnswering({ ok: true, data: {} })
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(modeStore.getState().tool).toBe('move')
  })

  it('returns to Move once a note is saved', async () => {
    live({ canWrite: true })
    act(() => modeStore.setState({ tool: 'note' }))
    boardAnswering({ ok: true, data: {} })
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(modeStore.getState().tool).toBe('move')
  })

  it('stays on the Note tool with the text and the error when a save fails', async () => {
    live({ canWrite: true })
    act(() => modeStore.setState({ tool: 'note' }))
    boardAnswering({
      ok: false,
      error: { code: 'frame-not-found', message: 'No frame hero.' },
    })
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Warmer sky')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(modeStore.getState().tool).toBe('note')
    expect(screen.getByRole('textbox')).toHaveValue('Warmer sky')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('names the frame it pins to', () => {
    render(<Composer pick={PICK} onClose={() => {}} />)

    expect(
      screen.getByRole('region', { name: 'New note on hero' }),
    ).toBeInTheDocument()
  })
})

describe('useNoteTool', () => {
  function Canvas() {
    useNoteTool()
    return null
  }

  it('returns the Note tool to Move and closes a new note when the canvas leaves', () => {
    const { unmount } = render(<Canvas />)
    act(() => {
      modeStore.setState({ tool: 'note' })
      notesUi.setState({ open: { kind: 'new', pick: PICK } })
    })

    unmount()

    expect(modeStore.getState().tool).toBe('move')
    expect(notesUi.getState().open).toBeNull()
  })

  it('leaves another tool as it was when the canvas leaves', () => {
    const { unmount } = render(<Canvas />)
    act(() => modeStore.setState({ tool: 'hand' }))

    unmount()

    expect(modeStore.getState().tool).toBe('hand')
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

  it('hands the thread to the listening session holding the frame claim', () => {
    live({
      canWrite: true,
      listeners: [listener('a'), listener('b', 'codex · frameboard')],
      claims: { 'studio/home/hero': claimBy('b') },
    })

    render(<Thread notes={thread} page="studio/home" onClose={() => {}} />)

    expect(
      screen.getByRole('combobox', { name: 'Send to' }),
    ).toHaveDisplayValue('codex · frameboard')
  })

  it('keeps a reply plain when nobody listens and serve can start a session', async () => {
    live({ canWrite: true, dispatch: true })
    const sent = boardRecording()
    render(<Thread notes={thread} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Looks good')

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(
      screen.getByRole('combobox', { name: 'Send to' }),
    ).toHaveDisplayValue('No session')
    expect(sent).toEqual([
      { path: '/api/notes/n_1/replies', body: { text: 'Looks good' } },
    ])
  })

  it('hands a reply to a new session once New session is picked', async () => {
    live({ canWrite: true, dispatch: true })
    const sent = boardRecording()
    render(<Thread notes={thread} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Make it bolder')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Send to' }),
      'New session',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(sent).toEqual([
      {
        path: '/api/notes/n_1/replies',
        body: { text: 'Make it bolder', dispatch: true },
      },
    ])
  })

  it("shows the developer's and the agent's messages in order", () => {
    render(<Thread notes={thread} onClose={() => {}} />)

    const messages = screen.getAllByRole('listitem')
    expect(screen.getByRole('region', { name: 'Note 2' })).toBeInTheDocument()
    expect(messages[0]).toHaveTextContent('You')
    expect(messages[0]).toHaveTextContent('Tighten the header')
    expect(messages[1]).toHaveTextContent('claude')
    expect(messages[1]).toHaveTextContent('Done. The third chip')
  })

  it("draws the agent's avatar at 4.5:1 or better on its tint under .dark", () => {
    document.documentElement.classList.add('dark')

    try {
      render(<Thread notes={thread} onClose={() => {}} />)

      expect(contrastOnPage(screen.getByText('C'))).toBeGreaterThanOrEqual(4.5)
    } finally {
      document.documentElement.classList.remove('dark')
    }
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

  describe('in a card capped shorter than its messages', () => {
    const long = 'The hero copy now leads with the outcome. '.repeat(19)
    const replies = (count: number) => [
      note({ id: 'n_1', number: 2 }),
      ...Array.from({ length: count }, (_, index) =>
        note({
          id: `n_r${index}`,
          number: null,
          thread: 'n_1',
          from: 'agent',
          author: null,
          text: `${index + 1}. ${long}`,
        }),
      ),
    ]

    /** The thread inside a column capped at 400 px, as the popover holds it. */
    function Capped({ notes }: { notes: readonly BoardNote[] }) {
      return (
        <div className="flex flex-col" style={{ maxHeight: 400 }}>
          <Thread notes={notes} onClose={() => {}} />
        </div>
      )
    }

    function distanceFromEnd(list: HTMLElement): number {
      return list.scrollHeight - list.scrollTop - list.clientHeight
    }

    it('follows a new reply while the list sits at its newest', async () => {
      const { rerender } = render(<Capped notes={replies(4)} />)
      const list = screen.getByRole('list', { name: 'Messages' })
      await expect.poll(() => distanceFromEnd(list)).toBeLessThan(1)

      rerender(<Capped notes={replies(5)} />)

      expect(distanceFromEnd(list)).toBeLessThan(1)
    })

    it('stays on an older message when a reply lands', async () => {
      const { rerender } = render(<Capped notes={replies(4)} />)
      const list = screen.getByRole('list', { name: 'Messages' })
      await expect.poll(() => distanceFromEnd(list)).toBeLessThan(1)
      list.scrollTo({ top: 0 })
      await new Promise((settled) =>
        list.addEventListener('scroll', settled, { once: true }),
      )

      rerender(<Capped notes={replies(5)} />)

      expect(list.scrollTop).toBe(0)
    })
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

  describe('on a previewed frame', () => {
    afterEach(() => {
      act(() => endPreview([HERO.ref]))
    })

    it('draws a frame note at the corner of the previewed width', () => {
      live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })
      renderLayer()

      act(() => setPreview([HERO.ref], 1440))

      expect(
        screen.getByRole('button', { name: 'Note 1 on hero' }),
      ).toHaveStyle({ left: '1440px', top: '0px' })
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

  it('closes a thread on a press outside its card', async () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1', number: 4 })] } })
    renderLayer()
    await userEvent.click(
      screen.getByRole('button', { name: 'Note 4 on hero' }),
    )

    await userEvent.click(document.body)

    expect(screen.queryByRole('region', { name: 'Note 4' })).toBeNull()
  })

  it('keeps a thread open on a press inside its card', async () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1', number: 4 })] } })
    renderLayer()
    await userEvent.click(
      screen.getByRole('button', { name: 'Note 4 on hero' }),
    )

    await userEvent.click(screen.getByRole('list', { name: 'Messages' }))

    expect(screen.getByRole('region', { name: 'Note 4' })).toBeInTheDocument()
  })

  it('reopens a thread with the reply left unsent in it', async () => {
    live({
      canWrite: true,
      notes: { 'studio/home': [note({ id: 'n_1', number: 4 })] },
    })
    renderLayer()
    const marker = screen.getByRole('button', { name: 'Note 4 on hero' })
    await userEvent.click(marker)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'half a thought',
    )

    await userEvent.click(document.body)
    await userEvent.click(marker)

    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(
      'half a thought',
    )
  })

  it('reopens a new note on the same frame with the text left unsaved', async () => {
    live({ canWrite: true })
    renderLayer()
    act(() => notesUi.setState({ open: { kind: 'new', pick: PICK } }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Note on hero' }),
      'move the button',
    )

    await userEvent.click(document.body)
    const closed = screen.queryByRole('textbox', { name: 'Note on hero' })
    act(() => notesUi.setState({ open: { kind: 'new', pick: PICK } }))

    expect([
      closed,
      screen.getByRole('textbox', { name: 'Note on hero' }),
    ]).toEqual([null, expect.objectContaining({ value: 'move the button' })])
  })

  it('closes a thread opened from its marker on Esc, with focus on the marker', async () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1', number: 4 })] } })
    renderLayer()
    await userEvent.click(
      screen.getByRole('button', { name: 'Note 4 on hero' }),
    )

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: 'Note 4' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Note 4 on hero' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
