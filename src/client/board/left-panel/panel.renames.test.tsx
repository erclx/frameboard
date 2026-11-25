import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard, receiveRename } from '@/client/live/store'
import type { ProjectRecord } from '@/shared/records/list'
import { boardOf, pageOf } from '@/test/board'

import { LeftPanel } from './panel'
import { leftTabStore, renameLeftTab } from './tab-store'

const BOARD = boardOf(pageOf([]))
const [STUDIO] = BOARD.projects as [ProjectRecord]

function panelOf(project: ProjectRecord) {
  return (
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <TooltipProvider>
        <LeftPanel project={project} page="home" assets={<p>the files</p>} />
      </TooltipProvider>
    </Router>
  )
}

const selected = () => screen.getByRole('tab', { selected: true }).textContent

describe('LeftPanel after a rename of its project', () => {
  beforeEach(() => {
    receiveBoard(liveStore, BOARD)
  })

  afterEach(() => {
    act(() => {
      liveStore.setState({ board: null, aliases: {} })
      leftTabStore.setState({ tab: 'design', project: null })
    })
  })

  /** Opens studio's Assets tab, then hears studio renamed to atelier. */
  async function renamed() {
    const panel = render(panelOf(STUDIO))
    await userEvent.click(screen.getByRole('tab', { name: 'Assets' }))
    act(() => {
      renameLeftTab('studio', 'atelier')
      receiveRename(liveStore, 'studio', 'atelier')
    })
    return panel
  }

  it('keeps its tab', async () => {
    const { rerender } = await renamed()

    rerender(panelOf({ ...STUDIO, name: 'atelier' }))

    expect(selected()).toBe('Assets')
  })

  it('opens a new project under the old name on Design', async () => {
    const { unmount } = await renamed()

    unmount()
    render(panelOf(STUDIO))

    expect(selected()).toBe('Design')
  })
})
