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
import { clear, selectionStore } from '@/client/board/selection'
import { liveStore, receiveBoard } from '@/client/live/store'
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
        'swatches',
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

  it('shows the page a frame sits on', async () => {
    render(<CommandPalette />)

    await openPalette()

    expect(
      await screen.findByRole('option', { name: /swatch card.*swatches/ }),
    ).toBeInTheDocument()
  })

  it('leaves out a hidden frame', async () => {
    render(<CommandPalette />)

    await openPalette()

    expect(screen.queryByRole('option', { name: /swatch hidden/ })).toBeNull()
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
    expect(await screen.findByRole('option', { name: 'Gated' })).toBeVisible()
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

  it('selects a frame on another page and opens that page', async () => {
    render(<CommandPalette />)

    await openPalette()
    await userEvent.click(
      await screen.findByRole('option', { name: /swatch card/ }),
    )

    expect([location.pathname, selectionStore.getState()]).toEqual([
      '/p/studio/swatches',
      { page: 'studio/swatches', frames: [OTHER_PAGE.ref] },
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
