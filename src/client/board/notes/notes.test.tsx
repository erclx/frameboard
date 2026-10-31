import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'
import type { BoardNote, Listener } from '@/shared/records/notes'
import { contrastOnPage } from '@/test/contrast'

import { HANDLE_REACH } from '../geometry/hit'
import { dropPending, holdBoxes } from '../geometry/write'
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

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads each message time at 4.5:1 or better on the card', () => {
      const { container } = render(<Thread notes={thread} onClose={() => {}} />)
      const time = container.querySelector('time')
      if (!time) throw new Error('no message time')

      expect(contrastOnPage(time)).toBeGreaterThanOrEqual(4.5)
    })

    it('reads the reply placeholder at 4.5:1 or better on the card', () => {
      live({ canWrite: true })

      render(<Thread notes={thread} onClose={() => {}} />)

      expect(
        contrastOnPage(
          screen.getByRole('textbox', { name: 'Reply' }),
          '::placeholder',
        ),
      ).toBeGreaterThanOrEqual(4.5)
    })
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

    it('leaves an arrow key a board action also binds to the list, running no action', async () => {
      let nudged = 0
      const unregister = registerActions([
        {
          id: 'test.nudgeUp',
          label: 'Nudge up',
          group: 'test',
          keys: ['ArrowUp'],
          run: () => nudged++,
        },
      ])
      const unbind = bindKeys(window)
      const pressed: KeyboardEvent[] = []
      try {
        render(<Capped notes={replies(4)} />)
        const list = screen.getByRole('list', { name: 'Messages' })
        list.addEventListener('keydown', (event) => pressed.push(event))
        list.focus()

        await userEvent.keyboard('{ArrowUp}')

        expect(pressed).toHaveLength(1)
        // Read once the press has run its course, so a later handler counts.
        expect(pressed[0]?.defaultPrevented).toBe(false)
        expect(nudged).toBe(0)
      } finally {
        unbind()
        unregister()
      }
    })
  })
})

describe('images in a note', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  function image(name = 'shot.png', type = 'image/png'): File {
    return new File([PNG], name, { type })
  }

  function clipboardOf(...files: File[]): DataTransfer {
    const transfer = new DataTransfer()
    for (const file of files) transfer.items.add(file)
    return transfer
  }

  /** The board storing each upload as one image and answering every other write empty. */
  function boardStoring(): { path: string; body: unknown }[] {
    const sent: { path: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (init.body instanceof FormData) {
        sent.push({
          path,
          body: {
            page: init.body.get('page'),
            files: init.body.getAll('files').map((file) => (file as File).name),
          },
        })
        return Response.json({
          ok: true,
          data: { images: ['.notes/0a1b2c3d4e5f.png'] },
        })
      }
      sent.push({ path, body: JSON.parse(String(init.body)) })
      return Response.json({ ok: true, data: {} })
    })
    return sent
  }

  it('shows a pasted image as a thumbnail and uploads it with the note on Save', async () => {
    live({ canWrite: true })
    const sent = boardStoring()
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Like this')
    await userEvent.paste(clipboardOf(image()))

    expect(screen.getByRole('img', { name: /shot\.png/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(sent).toEqual([
      {
        path: '/api/notes/images',
        body: { page: 'studio/home', files: ['shot.png'] },
      },
      {
        path: '/api/notes',
        body: {
          frame: 'studio/home/hero',
          text: 'Like this',
          images: ['.notes/0a1b2c3d4e5f.png'],
        },
      },
    ])
  })

  it('lands a pasted text as text and uploads nothing', async () => {
    live({ canWrite: true })
    const sent = boardStoring()
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.paste('Warmer sky')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('list', { name: 'Images' })).toBeNull()
    expect(sent).toEqual([
      {
        path: '/api/notes',
        body: { frame: 'studio/home/hero', text: 'Warmer sky' },
      },
    ])
  })

  it('refuses an SVG with a sentence and saves the note without it', async () => {
    live({ canWrite: true })
    const sent = boardStoring()
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox'), 'Logo')
    await userEvent.paste(clipboardOf(image('logo.svg', 'image/svg+xml')))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG, JPEG, GIF, and WebP images go in a note.',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(sent.map((each) => each.path)).toEqual(['/api/notes'])
  })

  it('takes an image back out on its remove control', async () => {
    live({ canWrite: true })
    render(<Composer pick={PICK} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.paste(clipboardOf(image()))

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove image 1' }),
    )

    expect(screen.queryByRole('img', { name: /shot\.png/ })).toBeNull()
  })

  it('sends a reply carrying a pasted image', async () => {
    live({ canWrite: true })
    const sent = boardStoring()
    render(
      <Thread
        notes={[note({ id: 'n_1' })]}
        page="studio/home"
        onClose={() => {}}
      />,
    )
    await userEvent.type(screen.getByRole('textbox'), 'And this')
    await userEvent.paste(clipboardOf(image()))

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(sent.at(-1)).toEqual({
      path: '/api/notes/n_1/replies',
      body: { text: 'And this', images: ['.notes/0a1b2c3d4e5f.png'] },
    })
  })

  it('asks for a reply to go with images held and no text, sending nothing', async () => {
    live({ canWrite: true })
    const sent = boardStoring()
    render(
      <Thread
        notes={[note({ id: 'n_1' })]}
        page="studio/home"
        onClose={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.paste(clipboardOf(image()))

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Write a reply to go with the images',
    )
    expect(sent).toEqual([])
  })

  it("links each message image to its full size under the page's .notes", () => {
    render(
      <Thread
        notes={[note({ id: 'n_1', images: ['.notes/0a1b2c3d4e5f.png'] })]}
        page="studio/home"
        onClose={() => {}}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Open image 1 full size' }),
    ).toHaveAttribute('href', '/api/note-images/studio/home/0a1b2c3d4e5f.png')
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

  it("points a pin's tail at its corner from past the corner handle's reach", () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })

    renderLayer()

    // The marker sits on no positioned ancestor, so its spot is the page's
    // 390,0, and the page is unscrolled.
    const origin = document.documentElement.getBoundingClientRect()
    const pin = screen
      .getByRole('button', { name: 'Note 1 on hero' })
      .getBoundingClientRect()
    expect({
      right: pin.left - (origin.left + 390) > HANDLE_REACH,
      up: origin.top - pin.bottom > HANDLE_REACH,
    }).toEqual({ right: true, up: true })
  })

  it("tags a marker with its frame's ref, which a frame drag matches", () => {
    live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })

    renderLayer()

    expect(
      screen.getByRole('button', { name: 'Note 1 on hero' }),
    ).toHaveAttribute('data-note-frame', 'studio/home/hero')
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

  describe('on a frame whose released box is still pending', () => {
    afterEach(() => {
      act(() => dropPending([HERO.ref]))
    })

    it('draws a frame note at the corner of the pending box', () => {
      live({ notes: { 'studio/home': [note({ id: 'n_1' })] } })
      renderLayer()

      act(() =>
        holdBoxes({ [HERO.ref]: { x: 20, y: -40, width: 500, height: 884 } }),
      )

      expect(
        screen.getByRole('button', { name: 'Note 1 on hero' }),
      ).toHaveStyle({ left: '520px', top: '-40px' })
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
