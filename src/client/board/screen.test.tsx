import '../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { IS_MAC } from '@/client/actions/keys'
import { bindKeys } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'

import { modeStore } from './mode'
import { BoardScreen } from './screen'

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
        {
          ref: 'studio/home',
          project: 'studio',
          name: 'home',
          path: '/board/studio/home',
          index: 0,
          layoutError: null,
          frames: [],
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
  unbind()
  liveStore.setState({ board: null })
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
    expect(screen.getByRole('button', { name: 'Zoom' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeVisible()
  })

  it('toggles Hide UI from its key', async () => {
    renderBoard()

    await userEvent.keyboard(`{${MOD}>}[Backslash]{/${MOD}}`)

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('keeps both panels in Play and says the frames take the clicks', async () => {
    renderBoard()

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.getAllByRole('complementary')).toHaveLength(2)
    expect(
      screen.getByText('Playing. Clicks go to the frames. Esc to edit'),
    ).toBeVisible()
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
