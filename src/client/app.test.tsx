import './styles.css'

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { ListResult, PageRecord } from '@/shared/records/list'

import { App } from './app'
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
      createdAt: null,
      projectFileError: null,
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

  it('says it is connecting until the first board arrives', () => {
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent(
      'Connecting to the board',
    )
  })

  it('lists the projects at the root', () => {
    receiveBoard(liveStore, BOARD)
    liveStore.setState({ connected: true })

    renderAt('/')

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible()
    expect(screen.getByRole('link', { name: /studio/ })).toBeVisible()
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
