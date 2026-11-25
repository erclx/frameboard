import '../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { IS_MAC } from '@/client/actions/keys'
import { bindKeys, findAction } from '@/client/actions/registry'
import { App } from '@/client/app'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import {
  liveStore,
  receiveBoard,
  receiveClaims,
  receiveFindings,
  receiveReload,
  receiveRename,
} from '@/client/live/store'
import {
  createUnseenStore,
  receiveChanges,
  unseenStore,
} from '@/client/live/unseen'
import { applyPatch, patchBetween } from '@/shared/board-sync/patch'
import type { ListResult, PageRecord } from '@/shared/records/list'

import { Canvas } from './canvas'
import { modeStore } from './mode'
import { BoardScreen } from './screen'

// Spied rather than replaced, so the rendered canvas is the real one.
vi.mock('./canvas', { spy: true })

const BOARD: ListResult = {
  root: '/board',
  projects: [
    {
      name: 'studio',
      path: '/board/studio',
      modifiedAt: '2026-10-15T00:00:00.000Z',
      title: null,
      createdAt: null,
      group: null,
      archived: false,
      projectFileError: null,
      transitions: [],
      checksOff: [],
      kits: [],
      pages: [
        {
          ref: 'studio/home',
          project: 'studio',
          name: 'home',
          path: '/board/studio/home',
          index: 0,
          layoutError: null,
          frames: [],
          sections: [],
        },
      ],
    },
  ],
}

/** The key tinykeys reads `$mod` as here. */
const MOD = IS_MAC ? 'Meta' : 'Control'

function renderBoard() {
  render(
    <Router hook={memoryLocation({ path: '/p/studio/home' }).hook}>
      <TooltipProvider>
        <BoardScreen project="studio" page="home" />
      </TooltipProvider>
    </Router>,
  )
}

let unbind = () => {}

beforeEach(() => {
  receiveBoard(liveStore, BOARD)
  unbind = bindKeys(window)
})

afterEach(() => {
  vi.useRealTimers()
  unbind()
  liveStore.setState({ board: null, canWrite: false })
  modeStore.setState({ mode: 'edit', tool: 'move', hideUi: false })
  localStorage.clear()
})

describe('BoardScreen', () => {
  it('shows both panels and the toolbar in Edit', () => {
    renderBoard()

    expect(
      screen.getByRole('complementary', { name: 'Pages and layers' }),
    ).toBeVisible()
    expect(
      screen.getByRole('complementary', { name: 'Inspector' }),
    ).toBeVisible()
  })

  it('keeps the project and zoom pills and the toolbar under Hide UI', async () => {
    renderBoard()

    await userEvent.click(screen.getByRole('button', { name: 'Hide UI' }))

    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show UI' })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Zoom \d+%$/ })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  })

  it('toggles Hide UI from its key', async () => {
    renderBoard()

    await userEvent.keyboard(`{${MOD}>}[Backslash]{/${MOD}}`)

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('keeps both panels in Play and says a click uses a frame', async () => {
    renderBoard()

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.getAllByRole('complementary')).toHaveLength(2)
    expect(
      screen.getByText('Playing. Click a frame to use it. Esc to edit'),
    ).toBeVisible()
  })

  it('says in the inspector that nothing selects in Play', async () => {
    renderBoard()

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.getByText('Playing. Nothing selects in Play.')).toBeVisible()
  })

  it('offers New project, which goes home', () => {
    const location = memoryLocation({ path: '/p/studio/home', record: true })
    liveStore.setState({ canWrite: true })
    render(
      <Router hook={location.hook}>
        <TooltipProvider>
          <BoardScreen project="studio" page="home" />
        </TooltipProvider>
      </Router>,
    )

    act(() => findAction('project.new')?.run())

    expect(location.history.at(-1)).toBe('/')
  })

  it('returns to Edit on Esc in Play', async () => {
    act(() => modeStore.setState({ mode: 'play' }))
    renderBoard()

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

/** A page holding one frame named after it, so its iframe reads which page it is. */
function framedPage(name: string, index: number): PageRecord {
  return {
    ref: `studio/${name}`,
    project: 'studio',
    name,
    path: `/board/studio/${name}`,
    index,
    layoutError: null,
    frames: [
      {
        ref: `studio/${name}/${name}`,
        project: 'studio',
        page: name,
        name,
        path: `/board/studio/${name}/${name}.html`,
        box: { x: 0, y: 0, width: 200, height: 200 },
        order: 0,
        hidden: false,
        locked: false,
        hugWidth: false,
        hugHeight: false,
        scroll: false,
        widths: [],
        placed: true,
        modifiedAt: '2026-10-15T00:00:00.000Z',
      },
    ],
    sections: [],
  }
}

describe('switching pages', () => {
  const NAMES = ['home', 'about', 'contact']

  function boardOf(names: readonly string[]): ListResult {
    const [project] = BOARD.projects
    if (!project) throw new Error('no project')
    return {
      ...BOARD,
      projects: [
        { ...project, pages: names.map((name, at) => framedPage(name, at)) },
      ],
    }
  }

  function boardAt(name: string) {
    return (
      <Router hook={memoryLocation({ path: `/p/studio/${name}` }).hook}>
        <TooltipProvider>
          <div style={{ width: 1200, height: 800 }}>
            <BoardScreen project="studio" page={name} />
          </div>
        </TooltipProvider>
      </Router>
    )
  }

  const iframeOf = (name: string) =>
    document.querySelector(`[data-frame="studio/${name}/${name}"] iframe`)

  /** Steps the staging a frame at a time, its clock alone faked. */
  function stageFrames() {
    act(() => vi.advanceTimersToNextFrame())
    act(() => vi.advanceTimersToNextFrame())
  }

  beforeEach(() => {
    receiveBoard(liveStore, boardOf(NAMES))
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
  })

  it('keeps the page left behind, hidden, while the new one stages', () => {
    const { rerender } = render(boardAt('home'))
    stageFrames()
    const left = iframeOf('home')

    rerender(boardAt('about'))

    expect(left).not.toBeNull()
    expect(left?.isConnected).toBe(true)
    expect(left).not.toBeVisible()
  })

  it('drops the page left behind once the new one is live', async () => {
    const { rerender } = render(boardAt('home'))
    stageFrames()
    const left = iframeOf('home')

    rerender(boardAt('about'))
    stageFrames()

    await waitFor(() => expect(left?.isConnected).toBe(false))
    expect(iframeOf('about')).toBeVisible()
  })

  it('shows the same iframes on a return before the drop', () => {
    const { rerender } = render(boardAt('home'))
    stageFrames()
    const left = iframeOf('home')

    rerender(boardAt('about'))
    rerender(boardAt('home'))

    expect(iframeOf('home')).toBe(left)
    expect(left).toBeVisible()
  })

  it('drops the older held page on a third switch', () => {
    const { rerender } = render(boardAt('home'))
    stageFrames()
    const oldest = iframeOf('home')
    // About never stages, so home is still held when contact opens.
    rerender(boardAt('about'))
    const held = document.querySelector('[data-frame="studio/about/about"]')

    rerender(boardAt('contact'))

    expect(oldest?.isConnected).toBe(false)
    expect(held?.isConnected).toBe(true)
  })

  it('drops the page left behind when a return reveals a live one', async () => {
    const { rerender } = render(boardAt('home'))
    stageFrames()
    rerender(boardAt('about'))
    const about = document.querySelector('[data-frame="studio/about/about"]')
    rerender(boardAt('home'))

    await waitFor(() => expect(about?.isConnected).toBe(false))
  })
})

describe('what a message renders', () => {
  /** A project of two pages, each holding one frame named after it. */
  function projectOf(name: string) {
    const [project] = BOARD.projects
    if (!project) throw new Error('no project')
    return {
      ...project,
      name,
      path: `/board/${name}`,
      pages: ['home', 'about'].map((page, at) => {
        const record = framedPage(page, at)
        return {
          ...record,
          ref: `${name}/${page}`,
          project: name,
          frames: record.frames.map((frame) => ({
            ...frame,
            ref: `${name}/${page}/${page}`,
            project: name,
          })),
        }
      }),
    }
  }

  const TWO: ListResult = {
    root: '/board',
    projects: [projectOf('studio'), projectOf('other')],
  }

  /** Moves one frame as a batch does, through a patch against the board held. */
  function patchFrame(ref: string) {
    const held = liveStore.getState().board
    if (!held) throw new Error('no board')
    const next = structuredClone(held)
    for (const project of next.projects) {
      for (const page of project.pages) {
        for (const frame of page.frames) {
          if (frame.ref === ref) frame.modifiedAt = '2026-11-25T00:00:00.000Z'
        }
      }
    }
    const patched = applyPatch(held, patchBetween(held, next))
    if (!patched) throw new Error('the patch does not apply')
    receiveBoard(liveStore, patched)
  }

  const MESSAGES: [string, (ref: string) => void][] = [
    ['a patch', patchFrame],
    ['a reload', (ref) => receiveReload(liveStore, [ref])],
    ['a kept reload', (ref) => receiveReload(liveStore, [ref], [ref])],
    [
      'findings',
      (ref) =>
        receiveFindings(liveStore, {
          [ref]: [
            {
              rule: 'theme',
              severity: 'error',
              frame: ref,
              path: `${ref}.html`,
              message: 'One theme alone.',
              location: null,
            },
          ],
        }),
    ],
    [
      'a claim',
      (ref) =>
        receiveClaims(liveStore, [
          {
            frame: ref,
            session: 's-1',
            agent: 'claude',
            tag: 'claude · s-1',
            claimedAt: '2026-10-19T10:00:00.000Z',
            expiresAt: '2026-10-19T10:05:00.000Z',
          },
        ]),
    ],
    [
      'an unseen change',
      (ref) =>
        receiveChanges(unseenStore, [
          {
            id: 'c1',
            frame: ref,
            at: '2026-10-19T12:00:00.000Z',
            hash: 'h1',
            author: null,
            elements: [],
            removed: 0,
            whole: true,
            created: true,
          },
        ]),
    ],
  ]

  /** The canvas's renders a message costs, with the board already at rest. */
  function rendersOf(message: () => void): number {
    vi.mocked(Canvas).mockClear()
    act(message)
    return vi.mocked(Canvas).mock.calls.length
  }

  function openHome() {
    const location = memoryLocation({ path: '/p/studio/home', record: true })
    render(
      <Router hook={location.hook}>
        <App />
      </Router>,
    )
    return location
  }

  beforeEach(() => {
    receiveBoard(liveStore, TWO)
  })

  afterEach(() => {
    unseenStore.setState(createUnseenStore(null).getState(), true)
    liveStore.setState({ reloads: {}, kept: {}, findings: {}, claims: {} })
  })

  it.each(MESSAGES)(
    'renders no canvas for %s in another project',
    (_, send) => {
      openHome()

      expect(rendersOf(() => send('other/home/home'))).toBe(0)
    },
  )

  it.each(MESSAGES)('renders the canvas for %s on the open page', (_, send) => {
    openHome()

    expect(rendersOf(() => send('studio/home/home'))).toBeGreaterThan(0)
  })

  it.each(MESSAGES.filter(([name]) => name !== 'an unseen change'))(
    'renders the canvas for %s on another page of the project, which it may hold',
    (_, send) => {
      openHome()

      expect(rendersOf(() => send('studio/about/about'))).toBeGreaterThan(0)
    },
  )

  it('keeps a frame its reload count through a rename of the open project', () => {
    const location = openHome()
    act(() => receiveReload(liveStore, ['studio/home/home']))

    act(() => receiveRename(liveStore, 'studio', 'atelier'))

    expect(location.history.at(-1)).toBe('/p/atelier/home')
    expect(vi.mocked(Canvas).mock.lastCall?.[0].reloads).toEqual({
      'atelier/home/home': 1,
    })
  })

  it('counts an unseen change of another project in the tab title', () => {
    openHome()

    act(() =>
      receiveChanges(unseenStore, [
        {
          id: 'c1',
          frame: 'other/home/home',
          at: '2026-10-19T12:00:00.000Z',
          hash: 'h1',
          author: null,
          elements: [],
          removed: 0,
          whole: true,
          created: true,
        },
      ]),
    )

    expect(document.title).toBe('(1) studio · Frameboard')
  })
})
