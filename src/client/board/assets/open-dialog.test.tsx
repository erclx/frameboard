import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { findAction } from '@/client/actions/registry'
import { closeFind, findStore, openFind } from '@/client/board/find/actions'
import { leftTabStore } from '@/client/board/left-panel/tab-store'
import { modeStore } from '@/client/board/mode'
import { liveStore } from '@/client/live/store'
import { CommandPalette } from '@/client/palette/commands'
import { openOverlay } from '@/client/palette/overlay'

import {
  openSourcing,
  sourcingDialogStore,
  useSourcingActions,
} from './open-dialog'

function Registered({ project = 'studio' }: { project?: string }) {
  useSourcingActions(project)
  return null
}

function run(id: string) {
  act(() => findAction(id)?.run())
}

afterEach(() => {
  act(() => {
    openOverlay(null)
    closeFind()
    modeStore.setState({ hideUi: false })
    leftTabStore.setState({ tab: 'design', project: null })
    liveStore.setState({ canWrite: false })
    sourcingDialogStore.setState({ open: false, inserting: false })
  })
})

describe('useSourcingActions', () => {
  it.each([
    ['assets.find', 'find'],
    ['assets.generate', 'generate'],
  ])('%s opens the dialog on %s from another tab', (id, view) => {
    render(<Registered />)

    run(id)

    expect(leftTabStore.getState().tab).toBe('assets')
    expect(sourcingDialogStore.getState()).toMatchObject({
      open: true,
      view,
      opener: view,
    })
  })

  it('shows a hidden UI first, as the left panel holds the dialog', () => {
    modeStore.setState({ hideUi: true })
    render(<Registered />)

    run('assets.find')

    expect(modeStore.getState().hideUi).toBe(false)
    expect(sourcingDialogStore.getState().open).toBe(true)
  })

  it('keeps the tab through the left panel’s first mount in another project', () => {
    leftTabStore.setState({ tab: 'design', project: 'marketing' })
    render(<Registered />)

    run('assets.find')

    expect(leftTabStore.getState()).toEqual({
      tab: 'assets',
      project: 'studio',
    })
  })

  it('closes the find panel, which stands in for the tabs', () => {
    openFind()
    render(<Registered />)

    run('assets.find')

    expect(findStore.getState().open).toBe(false)
  })

  it.each(['find', 'generate'])(
    'lists its command under a search of %s, in a tab that may not write too',
    async (query) => {
      liveStore.setState({ canWrite: false })
      render(
        <>
          <Registered />
          <CommandPalette />
        </>,
      )
      act(() => openOverlay('commands'))

      await userEvent.type(await screen.findByRole('combobox'), query)

      const row = await screen.findByRole('option', {
        name: new RegExp(`${query} media`, 'i'),
      })
      expect(row).toHaveAttribute('aria-disabled', 'false')
    },
  )

  it('closes the dialog when the board moves to another project', () => {
    const { rerender } = render(<Registered project="studio" />)
    act(() => openSourcing('find'))

    rerender(<Registered project="marketing" />)

    expect(sourcingDialogStore.getState().open).toBe(false)
  })
})
