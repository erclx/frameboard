import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findAction } from '@/client/actions/registry'
import { AvatarMenu } from '@/client/board/chrome/avatar-menu'
import { liveStore } from '@/client/live/store'
import { CommandPalette } from '@/client/palette/commands'
import { openOverlay } from '@/client/palette/overlay'
import { registerThemeActions } from '@/client/theme/actions'
import { createThemeStore } from '@/client/theme/store'

import { closeFind, findStore, openFind } from '../../find/actions'
import { modeStore } from '../../mode'
import { leftTabStore } from '../tab-store'
import { useThemeActions } from './actions'
import { closeTheme, openTheme, themeDialogStore } from './dialog-store'

function Registered({ project = 'studio' }: { project?: string }) {
  useThemeActions(project)
  return null
}

function run(id: string) {
  act(() => findAction(id)?.run())
}

beforeEach(() => {
  act(() => liveStore.setState({ canWrite: true }))
})

afterEach(() => {
  act(() => {
    openOverlay(null)
    closeFind()
    closeTheme()
    modeStore.setState({ hideUi: false })
    leftTabStore.setState({ tab: 'design', project: null })
    liveStore.setState({ canWrite: false })
  })
})

describe('useThemeActions', () => {
  it.each(['theme.addKit', 'theme.edit'])(
    '%s opens the dialog on Kits from another tab',
    (id) => {
      render(<Registered />)

      run(id)

      expect(leftTabStore.getState()).toEqual({
        tab: 'theme',
        project: 'studio',
      })
      expect(themeDialogStore.getState()).toMatchObject({
        open: true,
        section: 'kits',
        opener: 'edit',
      })
    },
  )

  it.each(['theme.addKit', 'theme.edit'])(
    '%s shows a hidden UI first, as the left panel holds the dialog',
    (id) => {
      modeStore.setState({ hideUi: true })
      render(<Registered />)

      run(id)

      expect(modeStore.getState().hideUi).toBe(false)
      expect(themeDialogStore.getState().open).toBe(true)
    },
  )

  it('closes the find panel, which stands in for the tabs', () => {
    openFind()
    render(<Registered />)

    run('theme.edit')

    expect(findStore.getState().open).toBe(false)
  })

  it('opens the Add kit list on Add kit alone', () => {
    render(<Registered />)

    run('theme.addKit')
    expect(themeDialogStore.getState().addingKit).toBe(true)

    run('theme.edit')
    expect(themeDialogStore.getState().addingKit).toBe(false)
  })

  it('lists Edit theme and not Add kit in a tab that may not write', async () => {
    liveStore.setState({ canWrite: false })
    render(
      <>
        <Registered />
        <CommandPalette />
      </>,
    )
    act(() => openOverlay('commands'))

    await userEvent.type(await screen.findByRole('combobox'), 'kit')

    expect(
      await screen.findByRole('option', { name: 'Edit theme' }),
    ).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('option', { name: 'Add kit' })).toBeNull()
  })

  it('stays out of the avatar menu’s theme choices', async () => {
    const unregister = registerThemeActions(createThemeStore())
    render(
      <>
        <Registered />
        <AvatarMenu name="Sam Rivera" />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Sam Rivera/ }))

    await userEvent.click(
      await screen.findByRole('menuitem', { name: /^Theme/ }),
    )

    expect(
      (await screen.findAllByRole('menuitemradio')).map(
        (choice) => choice.textContent,
      ),
    ).toEqual(['System', 'Light', 'Dark'])
    unregister()
  })

  it('closes the dialog when the board moves to another project', () => {
    const { rerender } = render(<Registered project="studio" />)
    act(() => openTheme('color', 'color'))

    rerender(<Registered project="marketing" />)

    expect(themeDialogStore.getState().open).toBe(false)
  })
})
