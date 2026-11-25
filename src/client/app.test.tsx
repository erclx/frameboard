import './styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { ListResult, PageRecord } from '@/shared/records/list'

import { App } from './app'
import { inspectorTabStore } from './board/inspector/tab-store'
import { modeStore } from './board/mode'
import { liveStore, receiveBoard } from './live/store'

function page(
  name: string,
  index: number,
  extra: Partial<PageRecord> = {},
): PageRecord {
  return {
    ref: `studio/${name}`,
    project: 'studio',
    name,
    path: `/board/studio/${name}`,
    index,
    layoutError: null,
    frames: [],
    sections: [],
    ...extra,
  }
}

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
        page('home', 0),
        page('pricing', 1, {
          layoutError: {
            path: '/board/studio/pricing/layout.json',
            message: 'Unexpected token',
          },
        }),
      ],
    },
  ],
}

function renderAt(path: string) {
  const memory = memoryLocation({ path, record: true })
  render(
    <div style={{ width: 1280, height: 720 }}>
      <Router hook={memory.hook}>
        <App />
      </Router>
    </div>,
  )
  return memory
}

describe('App', () => {
  afterEach(() => {
    liveStore.setState({ board: null, reloads: {}, connected: false })
  })

  describe('home before the first board', () => {
    afterEach(() => {
      localStorage.removeItem('frameboard.home.layout')
      localStorage.removeItem('frameboard.home.sort')
    })

    it('draws the header and Projects heading with New project disabled', () => {
      renderAt('/')

      expect(screen.getByText('Frameboard')).toBeVisible()
      expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'New project' }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it('says it is connecting in one status', () => {
      renderAt('/')

      expect(screen.getByRole('status')).toHaveTextContent(
        'Connecting to the board',
      )
    })

    it('draws grey cards where the projects will be, hidden from a reader', () => {
      renderAt('/')

      const cards = document.querySelectorAll('li[data-placeholder]')
      expect(cards.length).toBeGreaterThan(0)
      expect(cards[0]?.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(screen.queryByRole('link', { name: /studio/ })).toBeNull()
    })

    it('draws rows rather than cards for a remembered list layout', () => {
      localStorage.setItem('frameboard.home.layout', 'list')

      renderAt('/')

      expect(screen.getByText('Name')).toBeVisible()
    })

    it('names the remembered sort on its disabled Sort button', () => {
      localStorage.setItem('frameboard.home.sort', 'name')

      renderAt('/')

      expect(
        screen.getByRole('button', { name: /Sort: Name/ }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it('draws each grey card at the height the real card lands at', () => {
      renderAt('/')
      const grey = document.querySelector('li[data-placeholder]')
      const greyHeight = grey?.getBoundingClientRect().height ?? 0

      act(() => receiveBoard(liveStore, BOARD))

      const card = screen.getByRole('link', { name: /studio/ })
      expect(greyHeight).toBeGreaterThan(0)
      expect(card.getBoundingClientRect().height).toBeCloseTo(greyHeight, 0)
    })

    it('gives way to the projects once the board arrives', () => {
      renderAt('/')

      act(() => receiveBoard(liveStore, BOARD))

      expect(screen.getByRole('link', { name: /studio/ })).toBeVisible()
      expect(screen.queryByText('Connecting to the board')).toBeNull()
    })
  })

  describe('a board page before the first board', () => {
    afterEach(() => {
      modeStore.setState({ hideUi: false })
      inspectorTabStore.setState({ tab: 'design' })
      localStorage.removeItem('react-resizable-panels:frameboard.board.panels')
    })

    it('opens the left panel at its remembered width', () => {
      localStorage.setItem(
        'react-resizable-panels:frameboard.board.panels',
        JSON.stringify({ 'left,canvas,right': { layout: [25, 56.25, 18.75] } }),
      )

      renderAt('/p/studio/home')

      const left = screen.getByRole('complementary', {
        name: 'Pages and layers',
      })
      expect(left.getBoundingClientRect().width).toBeCloseTo(320, -1)
    })

    it('marks the remembered inspector tab', () => {
      inspectorTabStore.setState({ tab: 'export' })

      renderAt('/p/studio/home')

      const inspector = screen.getByRole('complementary', {
        name: 'Inspector',
      })
      expect(
        within(inspector).getByRole('tab', { name: 'Export' }),
      ).toHaveAttribute('aria-selected', 'true')
    })

    it('draws the Pages and Layers buttons disabled', () => {
      renderAt('/p/studio/home')

      expect(screen.getByRole('button', { name: 'Add page' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      expect(
        screen.getByRole('button', { name: 'Collapse all layers' }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it('draws the project name from the route and both panels', () => {
      modeStore.setState({ hideUi: false })

      renderAt('/p/studio/home')

      expect(screen.getByText('studio')).toBeVisible()
      expect(
        screen.getByRole('complementary', { name: 'Pages and layers' }),
      ).toBeVisible()
      expect(
        screen.getByRole('complementary', { name: 'Inspector' }),
      ).toBeVisible()
      expect(screen.getByRole('heading', { name: 'Pages' })).toBeVisible()
      expect(screen.getByRole('heading', { name: 'Layers' })).toBeVisible()
    })

    it('draws the tools disabled', () => {
      renderAt('/p/studio/home')

      const tools = screen.getByRole('toolbar', { name: 'Tools' })
      expect(
        within(tools).getByRole('button', { name: 'Move' }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it.each([
      'Account',
      /^Zoom \d+%$/,
      'Pointer tools',
      'Frame tools',
      'Shapes',
    ])('holds the %s menu shut, reading disabled', async (name) => {
      renderAt('/p/studio/home')
      const trigger = screen.getByRole('button', { name })

      await userEvent.click(trigger)

      expect(trigger).toHaveAttribute('aria-disabled', 'true')
      expect(trigger).not.toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('keeps a shut menu trigger focusable, opening nothing from the keyboard', async () => {
      renderAt('/p/studio/home')
      const trigger = screen.getByRole('button', { name: 'Account' })

      act(() => trigger.focus())
      await userEvent.keyboard('{Enter}{ }{ArrowDown}')

      expect(trigger).toHaveFocus()
      expect(trigger).not.toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('opens the menus once the board arrives', async () => {
      renderAt('/p/studio/home')

      act(() => receiveBoard(liveStore, BOARD))
      await screen.findByRole('navigation', { name: 'Pages' })
      await userEvent.click(screen.getByRole('button', { name: 'Shapes' }))

      const menu = await screen.findByRole('menu')
      // The popup fades in from opacity 0, which a loaded run can still catch.
      await vi.waitFor(() => expect(menu).toBeVisible())
    })

    it('draws one grey frame on the canvas, hidden from a reader', () => {
      renderAt('/p/studio')

      const frame = document.querySelector('main [data-placeholder]')
      expect(frame).toHaveAttribute('aria-hidden', 'true')
    })

    it('says it is connecting in one status', () => {
      renderAt('/p/studio/home')

      expect(screen.getByRole('status')).toHaveTextContent(
        'Connecting to the board',
      )
    })

    it('draws the canvas alone under Hide UI', () => {
      modeStore.setState({ hideUi: true })

      renderAt('/p/studio/home')

      expect(
        screen.queryByRole('complementary', { name: 'Inspector' }),
      ).toBeNull()
      expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
    })

    it('gives way to the board once it arrives', () => {
      renderAt('/p/studio/pricing')

      act(() => receiveBoard(liveStore, BOARD))

      const pages = screen.getByRole('navigation', { name: 'Pages' })
      expect(pages.querySelector('[aria-current="page"]')).toHaveTextContent(
        'pricing',
      )
      expect(screen.queryByText('Connecting to the board')).toBeNull()
    })

    it('gives way to the missing message for a project the board lacks', () => {
      renderAt('/p/gone/home')

      act(() => receiveBoard(liveStore, BOARD))

      expect(screen.getByText('No project gone on this board.')).toBeVisible()
    })
  })

  it('keeps a bare status line on an address with no shell', () => {
    renderAt('/elsewhere')

    expect(screen.getByRole('status')).toHaveTextContent(
      'Connecting to the board',
    )
    expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull()
  })

  it('lists the projects at the root', () => {
    receiveBoard(liveStore, BOARD)
    liveStore.setState({ connected: true })

    renderAt('/')

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible()
    expect(screen.getByRole('link', { name: /studio/ })).toBeVisible()
  })

  it('lists a project a later board adds while home is open', () => {
    const [studio] = BOARD.projects
    if (!studio) throw new Error('no project')
    receiveBoard(liveStore, BOARD)
    renderAt('/')

    act(() =>
      receiveBoard(liveStore, {
        ...BOARD,
        projects: [studio, { ...studio, name: 'atlas', pages: [] }],
      }),
    )

    expect(screen.getByRole('link', { name: /^atlas/ })).toBeInTheDocument()
  })

  it("sends a project's route to its first page", () => {
    receiveBoard(liveStore, BOARD)

    const memory = renderAt('/p/studio')

    expect(memory.history.at(-1)).toBe('/p/studio/home')
  })

  it('marks the open page in the pages list', () => {
    receiveBoard(liveStore, BOARD)

    renderAt('/p/studio/pricing')

    const pages = screen.getByRole('navigation', { name: 'Pages' })
    expect(pages.querySelector('[aria-current="page"]')).toHaveTextContent(
      'pricing',
    )
    expect(
      screen.getByRole('img', { name: 'Layout does not read' }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected token')
  })

  it('offers the way home for a project the board does not hold', () => {
    receiveBoard(liveStore, BOARD)

    renderAt('/p/gone/home')

    expect(screen.getByText('No project gone on this board.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('says the server is away while the socket reconnects', () => {
    receiveBoard(liveStore, BOARD)

    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting')
  })
})
