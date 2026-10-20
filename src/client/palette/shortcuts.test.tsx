import '../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type Action,
  bindKeys,
  registerActions,
} from '@/client/actions/registry'

import { registerPaletteActions } from './actions'
import { openOverlay } from './overlay'
import { ShortcutsSheet } from './shortcuts'

const cleanups: (() => void)[] = []

function register(...actions: Action[]): void {
  cleanups.push(registerActions(actions))
}

function action(id: string, extra: Partial<Action> = {}) {
  const made = {
    id,
    label: id,
    group: 'tool',
    runs: 0,
    run: () => {
      made.runs += 1
    },
    ...extra,
  }
  return made
}

const row = (label: string) =>
  within(screen.getByRole('dialog')).getByText(label).closest('li')!

afterEach(() => {
  act(() => openOverlay(null))
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('ShortcutsSheet', () => {
  it('lists the sections in the order the reference draws them', async () => {
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))

    const dialog = await screen.findByRole('dialog', {
      name: 'Keyboard shortcuts',
    })
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Tools', 'Selection', 'View', 'Frames', 'Arrange'])
  })

  it('prints the key a registered action binds', async () => {
    register(action('tool.move', { keys: ['v'] }))
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Move').querySelector('kbd')?.textContent).toBe('V')
  })

  it('lists Find under Tools with its key', async () => {
    register(action('find.open', { keys: ['$mod+KeyF'] }))
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Find').querySelector('kbd')?.textContent).toMatch(
      /^(⌘ F|Ctrl\+F)$/,
    )
  })

  it('greys a row whose action is not registered yet', async () => {
    register(action('tool.move', { keys: ['v'] }))
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect([
      row('Move').getAttribute('aria-disabled'),
      row('Undo').getAttribute('aria-disabled'),
    ]).toEqual([null, 'true'])
  })

  it('joins two actions on one row as two keys', async () => {
    register(
      action('arrange.alignLeft', { keys: ['Alt+KeyA'] }),
      action('arrange.alignRight', { keys: ['Alt+KeyD'] }),
    )
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(
      [...row('Align left, right').querySelectorAll('kbd kbd')].map(
        (key) => key.textContent,
      ),
    ).toHaveLength(2)
  })

  it('opens on ?', async () => {
    cleanups.push(registerPaletteActions(), bindKeys(window))
    render(<ShortcutsSheet />)

    await userEvent.keyboard('{Shift>}?{/Shift}')

    expect(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument()
  })

  it('shows its own key as ?', async () => {
    cleanups.push(registerPaletteActions())
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('This list').querySelector('kbd')?.textContent).toBe('?')
  })

  it('closes on Esc without reaching the keys bound to it', async () => {
    const exitPlay = action('mode.exitPlay', { keys: ['Escape'] })
    register(exitPlay)
    cleanups.push(bindKeys(window))
    render(<ShortcutsSheet />)
    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(exitPlay.runs).toBe(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
