import '../../styles.css'

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { projectStore } from '@/client/projects/actions'
import type { ProjectRecord } from '@/shared/records/list'
import { keyboardFocus } from '@/test/focus-ring'
import { realClick } from '@/test/real-pointer'

import { Home } from '../home'
import { dropPin, folderPin, pinnedProjects } from '../pins'
import { SECOND_CLICK_MS } from './title-click'

function project(name: string, group: string | null = null): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt: '2026-10-15T09:00:00.000Z',
    createdAt: null,
    group,
    archived: false,
    projectFileError: null,
    pages: [],
  }
}

const BOARD = [
  project('drawings'),
  project('web', 'Client A'),
  project('app', 'Client A'),
]

/** Renders the live home over `BOARD`, recording each write it sends. */
function renderHome({
  layout = 'grid',
  canWrite = true,
}: { layout?: 'grid' | 'list'; canWrite?: boolean } = {}) {
  const sent: { path: string; body: unknown }[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true, data: {} })
  })
  localStorage.setItem('frameboard.home.layout', layout)
  liveStore.setState({ canWrite, board: { root: '/board', projects: BOARD } })
  render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <Toaster>
        <Home projects={BOARD} calls={calls} />
      </Toaster>
    </Router>,
  )
  return sent
}

const folder = () => screen.getByRole('button', { name: /^Client A/ })

async function openMenu() {
  await userEvent.pointer({ keys: '[MouseRight]', target: folder() })
  return screen.findByRole('menu')
}

const item = (menu: HTMLElement, name: string) =>
  within(menu).getByRole('menuitem', { name })

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  act(() => {
    liveStore.setState({ canWrite: false, board: null })
    projectStore.setState({
      focused: null,
      folder: null,
      renaming: null,
      renamingFolder: null,
      openFolder: null,
      pendingRename: null,
      focusTarget: null,
    })
    dropPin(folderPin('client a'))
    dropPin(folderPin('client b'))
  })
  localStorage.removeItem('frameboard.home.layout')
})

describe('FolderMenu', () => {
  it('offers Open, Rename, Ungroup, and Pin on a right click', async () => {
    renderHome()

    const menu = await openMenu()

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((entry) => entry.textContent),
    ).toEqual(['Open↵', 'RenameF2', 'Ungroup', 'Pin'])
  })

  it('opens the folder panel from Open', async () => {
    renderHome()

    await userEvent.click(item(await openMenu(), 'Open'))

    expect(
      await screen.findByRole('dialog', { name: 'Client A' }),
    ).toBeInTheDocument()
  })

  it('fades the card ⋯ once a pointer closes its menu off the card', async () => {
    renderHome()
    const more = screen.getByRole('button', {
      name: 'Folder actions for Client A',
    })
    await realClick(more)
    await screen.findByRole('menu')

    await realClick(screen.getByRole('heading', { name: 'Projects' }))

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(getComputedStyle(more).opacity).toBe('0')
  })

  it('opens the same menu from the card ⋯', async () => {
    renderHome()

    await userEvent.click(
      screen.getByRole('button', { name: 'Folder actions for Client A' }),
    )

    expect(
      item(await screen.findByRole('menu'), 'Ungroup'),
    ).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('ungroups every member from Ungroup', async () => {
    const sent = renderHome()

    await userEvent.click(item(await openMenu(), 'Ungroup'))

    expect(sent).toEqual([
      {
        path: '/api/project/group',
        body: { refs: ['web', 'app'], group: null },
      },
    ])
  })

  it('pins the folder above the rest, marked, and offers Unpin', async () => {
    renderHome()

    await userEvent.click(item(await openMenu(), 'Pin'))

    const [first] = screen.getAllByRole('listitem')
    expect(first).toContainElement(folder())
    expect(
      within(folder()).getByRole('img', { name: 'Pinned' }),
    ).toBeInTheDocument()
    expect(item(await openMenu(), 'Unpin')).toBeInTheDocument()
  })

  it('opens the menu on a row in the list', async () => {
    renderHome({ layout: 'list' })

    await userEvent.click(item(await openMenu(), 'Open'))

    expect(folder()).toHaveAttribute('aria-expanded', 'true')
  })

  it('leaves Open off an expanded row, so a later grid opens no panel unasked', async () => {
    renderHome({ layout: 'list' })
    await userEvent.click(item(await openMenu(), 'Open'))

    const menu = await openMenu()

    expect(within(menu).queryByRole('menuitem', { name: 'Open' })).toBeNull()
    expect(projectStore.getState().openFolder).toBeNull()
  })

  describe('on a read-only tab', () => {
    it('opens with its writes off and Pin still on', async () => {
      renderHome({ canWrite: false })

      const menu = await openMenu()

      expect(item(menu, 'Rename')).toHaveAttribute('aria-disabled', 'true')
      expect(item(menu, 'Ungroup')).toHaveAttribute('aria-disabled', 'true')
      expect(item(menu, 'Pin')).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('opens the folder rather than renaming on a double click', async () => {
      renderHome({ canWrite: false })

      await userEvent.dblClick(within(folder()).getByText('Client A'))

      expect(screen.queryByRole('textbox')).toBeNull()
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })
})

describe('renaming in place', () => {
  it('renames from a double click on the card title without opening it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderHome()

    await userEvent.dblClick(within(folder()).getByText('Client A'))
    act(() => vi.advanceTimersByTime(SECOND_CLICK_MS))

    expect(
      screen.getByRole('textbox', { name: 'Rename folder Client A' }),
    ).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the folder from one click on its title', async () => {
    renderHome()

    await userEvent.click(within(folder()).getByText('Client A'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('renames from a double click on the open folder title', async () => {
    const sent = renderHome()
    await userEvent.click(folder())
    const panel = await screen.findByRole('dialog')

    await userEvent.dblClick(within(panel).getByText('Client A'))
    await userEvent.keyboard('Client B{Enter}')

    expect(sent).toEqual([
      {
        path: '/api/project/group',
        body: { refs: ['web', 'app'], group: 'Client B' },
      },
    ])
  })

  describe('the pen in the open folder', () => {
    it('opens the rename field from one click', async () => {
      renderHome()
      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')

      await userEvent.click(
        within(panel).getByRole('button', { name: 'Rename folder' }),
      )

      expect(
        screen.getByRole('textbox', { name: 'Rename folder Client A' }),
      ).toHaveFocus()
    })

    it('leaves the header while the field is open', async () => {
      renderHome()
      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')

      await userEvent.click(
        within(panel).getByRole('button', { name: 'Rename folder' }),
      )

      expect(
        within(panel).queryByRole('button', { name: 'Rename folder' }),
      ).toBeNull()
    })

    it('comes back once Esc cancels the rename', async () => {
      renderHome()
      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')
      await userEvent.click(
        within(panel).getByRole('button', { name: 'Rename folder' }),
      )

      await userEvent.keyboard('{Escape}')

      expect(
        within(panel).getByRole('button', { name: 'Rename folder' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBe(panel)
    })

    it('keeps the pen out of the panel name', async () => {
      renderHome()
      await userEvent.click(folder())

      const panel = await screen.findByRole('dialog')

      expect(
        within(panel).getByRole('button', { name: 'Rename folder' }),
      ).toBeInTheDocument()
      expect(panel).toHaveAccessibleName('Client A')
    })

    it('keeps the pen hidden when a pointer opens the folder away from its header', async () => {
      renderHome()

      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')

      const pen = within(panel).getByRole('button', { name: 'Rename folder' })
      expect(getComputedStyle(pen).opacity).toBe('0')
    })

    it('shows the pen while the keyboard focuses it', async () => {
      renderHome()
      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')
      const pen = within(panel).getByRole('button', { name: 'Rename folder' })

      await keyboardFocus(pen)

      expect(getComputedStyle(pen).opacity).toBe('1')
    })

    it('shows no pen in a tab that cannot write', async () => {
      renderHome({ canWrite: false })
      await userEvent.click(folder())
      const panel = await screen.findByRole('dialog')

      expect(
        within(panel).queryByRole('button', { name: 'Rename folder' }),
      ).toBeNull()
    })
  })

  it('renames from a double click on a row title, leaving it closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderHome({ layout: 'list' })

    await userEvent.dblClick(within(folder()).getByText('Client A'))
    act(() => vi.advanceTimersByTime(SECOND_CLICK_MS))

    expect(
      screen.getByRole('textbox', { name: 'Rename folder Client A' }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Client A' })).toBeNull()
  })

  it('carries a pin to the folder under its new name', async () => {
    renderHome()
    await userEvent.click(item(await openMenu(), 'Pin'))

    await userEvent.dblClick(within(folder()).getByText('Client A'))
    await userEvent.keyboard('{Control>}a{/Control}Client B{Enter}')

    await waitFor(() =>
      expect(pinnedProjects().has(folderPin('client b'))).toBe(true),
    )
    expect(pinnedProjects().has(folderPin('client a'))).toBe(false)
  })

  it('keeps the field open with its refusal on a name another folder holds', async () => {
    const sent = renderHome()
    liveStore.setState({
      board: {
        root: '/board',
        projects: [...BOARD, project('notes', 'Personal')],
      },
    })
    await userEvent.dblClick(within(folder()).getByText('Client A'))

    await userEvent.keyboard('{Control>}a{/Control}personal{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A folder named Personal already exists.',
    )
    expect(sent).toEqual([])
  })
})
