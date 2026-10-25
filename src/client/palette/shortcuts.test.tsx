import '../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import {
  type Action,
  bindKeys,
  findAction,
  registerActions,
} from '@/client/actions/registry'
import { useHomeAction } from '@/client/projects/actions'

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
    ).toEqual(['Tools', 'Selection', 'View', 'Frames', 'Arrange', 'Agents'])
  })

  it('lists the agent change keys under Agents', async () => {
    register(
      action('changes.next', { keys: ['BracketRight'] }),
      action('changes.previous', { keys: ['BracketLeft'] }),
    )
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect([
      row('Next change').querySelector('kbd kbd')?.textContent,
      row('Previous change').querySelector('kbd kbd')?.textContent,
    ]).toEqual([']', '['])
  })

  describe('the Single-key shortcuts switch', () => {
    afterEach(() => {
      setCharacterKeys(true)
    })

    it('turns the character keys off from the header', async () => {
      const move = action('tool.move', { keys: ['v'] })
      register(move)
      cleanups.push(bindKeys(window))
      render(<ShortcutsSheet />)
      act(() => openOverlay('shortcuts'))
      const toggle = await screen.findByRole('switch', {
        name: 'Single-key shortcuts',
      })

      await userEvent.click(toggle)
      act(() => openOverlay(null))
      await userEvent.keyboard('v')

      expect([toggle.getAttribute('aria-checked'), move.runs]).toEqual([
        'false',
        0,
      ])
    })

    it('names the palette command after what it does next', () => {
      cleanups.push(registerPaletteActions())
      const toggle = findAction('help.characterKeys')

      const before = toggle?.command?.label
      toggle?.run()

      expect([before, toggle?.command?.label]).toEqual([
        'Turn single-key shortcuts off',
        'Turn single-key shortcuts on',
      ])
    })

    it('draws an off key faint and keeps a modifier key as it is', async () => {
      register(
        action('tool.move', { keys: ['v'] }),
        action('find.open', { keys: ['$mod+KeyF'] }),
      )
      setCharacterKeys(false)
      render(<ShortcutsSheet />)

      act(() => openOverlay('shortcuts'))
      await screen.findByRole('dialog')

      expect([
        row('Move').querySelector('kbd kbd')?.hasAttribute('data-off'),
        row('Find').querySelector('kbd kbd')?.hasAttribute('data-off'),
      ]).toEqual([true, false])
    })
  })

  it('prints the key a registered action binds', async () => {
    register(action('tool.move', { keys: ['v'] }))
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Move').querySelector('kbd')?.textContent).toBe('V')
  })

  it('lists Zoom to 100% under View with its key', async () => {
    register(action('view.zoom100', { keys: ['Shift+Digit0'] }))
    render(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Zoom to 100%').querySelector('kbd kbd')?.textContent).toMatch(
      /^(⇧ 0|Shift\+0)$/,
    )
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

  describe('the home key', () => {
    function HomeAction({ goHome }: { goHome: () => void }) {
      useHomeAction(goHome)
      return null
    }

    it('goes home on Alt+ArrowUp', async () => {
      const goHome = vi.fn()
      cleanups.push(bindKeys(window))
      render(<HomeAction goHome={goHome} />)

      await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')

      expect(goHome).toHaveBeenCalledOnce()
    })

    it('lists All projects with its key on a board', async () => {
      render(
        <>
          <HomeAction goHome={() => {}} />
          <ShortcutsSheet />
        </>,
      )

      act(() => openOverlay('shortcuts'))
      await screen.findByRole('dialog')

      expect(row('All projects').querySelector('kbd kbd')?.textContent).toMatch(
        /^(⌥ ↑|Alt\+↑)$/,
      )
    })
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
