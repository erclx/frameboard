import '../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type Action,
  bindKeys,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { useChangeActions } from '@/client/board/changes/actions'
import { clear, selectionStore } from '@/client/board/selection'
import { liveStore, receiveBoard } from '@/client/live/store'
import { createUnseenStore, receiveChanges } from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { CommandPalette } from './commands'
import { openOverlay } from './overlay'

const SWATCH = frameOf('swatch grid')
const HIDDEN = frameOf('swatch hidden', { hidden: true })
const OTHER_PAGE = frameOf('swatch card', {
  ref: 'studio/swatches/swatch card',
  page: 'swatches',
})
const PLAIN = frameOf('plain')

const BOARD = boardOf(
  pageOf([SWATCH, HIDDEN, PLAIN]),
  pageOf([OTHER_PAGE], 'swatches'),
)
BOARD.projects.push({
  ...BOARD.projects[0]!,
  name: 'swatch library',
  pages: [],
})

const cleanups: (() => void)[] = []

function register(...actions: Action[]): void {
  cleanups.push(registerActions(actions))
}

function action(id: string, label: string, extra: Partial<Action> = {}) {
  const made = {
    id,
    label,
    group: 'view',
    runs: 0,
    run: () => {
      made.runs += 1
    },
    ...extra,
  }
  return made
}

function changeTo(frame: string): FrameChange {
  return {
    id: `c-${frame}`,
    frame,
    at: '2026-10-19T12:00:00.000Z',
    hash: 'c'.repeat(64),
    author: null,
    elements: [4],
    removed: 0,
    whole: false,
    created: false,
  }
}

async function openPalette() {
  act(() => openOverlay('commands'))
  return screen.findByRole('combobox')
}

beforeEach(() => {
  receiveBoard(liveStore, BOARD)
  history.pushState(null, '', '/p/studio/home')
})

afterEach(() => {
  act(() => openOverlay(null))
  while (cleanups.length > 0) cleanups.pop()?.()
  clear(selectionStore)
  history.pushState(null, '', '/')
})

describe('CommandPalette', () => {
  it('filters frames, pages, actions, and projects as the query is typed', async () => {
    register(
      action('theme.toggle', 'Theme', {
        command: { label: 'Swatch theme' },
      }),
      action('view.zoomIn', 'Zoom in', { command: { label: 'Zoom in' } }),
    )
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'swatch')

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('swatch grid'),
        expect.stringContaining('swatch card'),
        'swatchesstudio',
        'Swatch theme',
        'swatch library',
      ]),
    )
    expect(screen.queryByRole('option', { name: /plain/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Zoom in/ })).toBeNull()
    expect(
      ['Frames', 'Pages', 'Actions', 'Projects'].map(
        (heading) => screen.queryByText(heading) !== null,
      ),
    ).toEqual([true, true, true, true])
  })

  it("finds an action by one of its command's keywords", async () => {
    register(
      action('theme.toggle', 'Theme', {
        command: { label: 'Toggle theme', keywords: ['dark', 'light'] },
      }),
    )
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'dark')

    expect(
      await screen.findByRole('option', { name: 'Toggle theme' }),
    ).toBeInTheDocument()
  })

  it('leaves out a row whose letters only spread across the middle of words', async () => {
    register(
      action('preview.phone', 'Phone', {
        command: { label: 'Preview at phone width' },
      }),
    )
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'new')

    expect(await screen.findByText('Nothing matches.')).toBeInTheDocument()
  })

  it('finds a row by runs of letters that each start a word', async () => {
    register(
      action('view.zoomToFit', 'Zoom to fit', {
        command: { label: 'Zoom to fit' },
      }),
    )
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'zofi')

    expect(
      await screen.findByRole('option', { name: 'Zoom to fit' }),
    ).toBeInTheDocument()
  })

  it('shows the project and page a frame sits on', async () => {
    render(<CommandPalette />)

    await openPalette()

    expect(
      await screen.findByRole('option', {
        name: /swatch card.*studio \/ swatches/,
      }),
    ).toBeInTheDocument()
  })

  it('lists a hidden frame, marked hidden', async () => {
    liveStore.setState({ canWrite: true })
    cleanups.push(() => liveStore.setState({ canWrite: false }))
    render(<CommandPalette />)

    await openPalette()

    const row = await screen.findByRole('option', {
      name: /swatch hidden.*Hidden/,
    })
    expect(row).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('disables a hidden frame in a tab that cannot write', async () => {
    liveStore.setState({ canWrite: false })
    render(<CommandPalette />)

    await openPalette()

    expect(
      await screen.findByRole('option', { name: /swatch hidden/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it("finds another project's frame and opens its page", async () => {
    receiveBoard(liveStore, {
      ...BOARD,
      projects: [
        ...BOARD.projects,
        {
          ...BOARD.projects[0]!,
          name: 'atlas',
          pages: [
            {
              ...pageOf([], 'index'),
              ref: 'atlas/index',
              project: 'atlas',
              frames: [
                frameOf('globe', {
                  ref: 'atlas/index/globe',
                  project: 'atlas',
                  page: 'index',
                }),
              ],
            },
          ],
        },
      ],
    })
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'globe')
    await userEvent.click(
      await screen.findByRole('option', { name: /globe.*atlas \/ index/ }),
    )

    expect([location.pathname, selectionStore.getState().frames]).toEqual([
      '/p/atlas/index',
      ['atlas/index/globe'],
    ])
  })

  it("prints an action's hint on its row", async () => {
    register(
      action('project.rename', 'Rename', {
        command: { label: 'Rename project', hint: () => 'studio' },
      }),
    )
    render(<CommandPalette />)

    await openPalette()

    expect(
      await screen.findByRole('option', { name: /^Rename project ?studio$/ }),
    ).toBeInTheDocument()
  })

  it('lists an action only while it is enabled and carries command', async () => {
    let on = false
    register(
      action('a.on', 'Offered', { command: { label: 'Offered' } }),
      action('a.gated', 'Gated', {
        command: { label: 'Gated' },
        enabled: () => on,
      }),
      action('a.keyOnly', 'Key only'),
    )
    render(<CommandPalette />)

    await openPalette()

    expect(screen.queryByRole('option', { name: 'Gated' })).toBeNull()
    expect(screen.queryByRole('option', { name: /Key only/ })).toBeNull()
    expect(screen.getByRole('option', { name: 'Offered' })).toBeInTheDocument()
    on = true
    act(() => refreshActions())
    expect(
      await screen.findByRole('option', { name: 'Gated' }),
    ).toBeInTheDocument()
  })

  it('leaves out the mode the board is already in', async () => {
    register(
      action('mode.edit', 'Edit', {
        group: 'mode',
        command: { label: 'Switch to Edit' },
        checked: () => true,
      }),
      action('mode.play', 'Play', {
        group: 'mode',
        command: { label: 'Switch to Play' },
        checked: () => false,
      }),
    )
    render(<CommandPalette />)

    await openPalette()

    expect(screen.queryByRole('option', { name: 'Switch to Edit' })).toBeNull()
    expect(
      screen.getByRole('option', { name: 'Switch to Play' }),
    ).toBeInTheDocument()
  })

  it('prints an action’s key as chips', async () => {
    register(
      action('view.zoomToFit', 'Zoom to fit', {
        keys: ['Shift+Digit1'],
        command: { label: 'Zoom to fit' },
      }),
    )
    render(<CommandPalette />)

    await openPalette()

    const row = await screen.findByRole('option', { name: /Zoom to fit/ })
    expect(
      [...row.querySelectorAll('kbd')].map((chip) => chip.textContent),
    ).toEqual(expect.arrayContaining(['1']))
  })

  it('runs an action and closes', async () => {
    const zoom = action('view.zoomIn', 'Zoom in', {
      command: { label: 'Zoom in' },
    })
    register(zoom)
    render(<CommandPalette />)

    await openPalette()
    await userEvent.click(screen.getByRole('option', { name: /Zoom in/ }))

    expect(zoom.runs).toBe(1)
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
  })

  it('clears every agent change from Mark all agent changes seen, naming ⇧]', async () => {
    const store = createUnseenStore(null)
    receiveChanges(store, [
      changeTo('studio/home/swatch grid'),
      changeTo('studio/swatches/swatch card'),
    ])
    function WithChanges() {
      useChangeActions(store, () => {})
      return <CommandPalette />
    }
    render(<WithChanges />)

    await openPalette()
    const row = await screen.findByRole('option', {
      name: /Mark all agent changes seen/,
    })
    const chips = [...row.querySelectorAll('kbd')].map(
      (chip) => chip.textContent,
    )
    await userEvent.click(row)

    expect(chips).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(?:Shift|⇧)$/), ']']),
    )
    expect(store.getState().unseen).toEqual({})
  })

  it('selects a frame on another page and opens that page', async () => {
    render(<CommandPalette />)

    await openPalette()
    await userEvent.click(
      await screen.findByRole('option', { name: /swatch card/ }),
    )

    expect([location.pathname, selectionStore.getState()]).toEqual([
      '/p/studio/swatches',
      { page: 'studio/swatches', frames: [OTHER_PAGE.ref], element: null },
    ])
  })

  it('opens a project’s board from its row', async () => {
    render(<CommandPalette />)

    await openPalette()
    await userEvent.click(
      await screen.findByRole('option', { name: 'swatch library' }),
    )

    expect(location.pathname).toBe('/p/swatch%20library')
  })

  it('lists projects and app actions alone on the home view', async () => {
    history.pushState(null, '', '/')
    register(action('a.on', 'Offered', { command: { label: 'Offered' } }))
    render(<CommandPalette />)

    await openPalette()

    expect(
      ['Frames', 'Pages', 'Actions', 'Projects'].map(
        (heading) => screen.queryByText(heading) !== null,
      ),
    ).toEqual([false, false, true, true])
  })

  it('opens with no heading for a group that has no rows', async () => {
    receiveBoard(liveStore, { ...BOARD, projects: [] })
    render(<CommandPalette />)

    await openPalette()

    expect(
      ['Frames', 'Pages', 'Actions', 'Projects'].filter(
        (heading) => screen.queryByText(heading) !== null,
      ),
    ).toEqual([])
  })

  it('says nothing matches a query no row answers', async () => {
    render(<CommandPalette />)

    await userEvent.type(await openPalette(), 'zzzz')

    expect(await screen.findByText('Nothing matches.')).toBeInTheDocument()
  })

  it('closes on Esc without reaching the keys bound to it', async () => {
    const clearSelection = action('selection.clear', 'Clear selection', {
      keys: ['Escape'],
    })
    register(clearSelection)
    cleanups.push(bindKeys(window))
    render(<CommandPalette />)

    await openPalette()
    await userEvent.keyboard('{Escape}')

    expect(clearSelection.runs).toBe(0)
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
  })
})
