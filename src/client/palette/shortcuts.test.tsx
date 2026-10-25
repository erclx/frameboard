import '../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

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

/** Renders on a board's route, since the sheet swaps its sections on home. */
function renderOnBoard(ui: ReactNode) {
  return render(
    <Router hook={memoryLocation({ path: '/p/sketch/home' }).hook}>
      {ui}
    </Router>,
  )
}

afterEach(() => {
  act(() => openOverlay(null))
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('ShortcutsSheet', () => {
  it('lists the sections in the order the reference draws them', async () => {
    renderOnBoard(<ShortcutsSheet />)

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
    renderOnBoard(<ShortcutsSheet />)

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
      renderOnBoard(<ShortcutsSheet />)
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
      renderOnBoard(<ShortcutsSheet />)

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
    renderOnBoard(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Move').querySelector('kbd')?.textContent).toBe('V')
  })

  it('lists Zoom to 100% under View with its key', async () => {
    register(action('view.zoom100', { keys: ['Shift+Digit0'] }))
    renderOnBoard(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Zoom to 100%').querySelector('kbd kbd')?.textContent).toMatch(
      /^(⇧ 0|Shift\+0)$/,
    )
  })

  it('lists Find under Tools with its key', async () => {
    register(action('find.open', { keys: ['$mod+KeyF'] }))
    renderOnBoard(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('Find').querySelector('kbd')?.textContent).toMatch(
      /^(⌘ F|Ctrl\+F)$/,
    )
  })

  it('greys a row whose action is not registered yet', async () => {
    register(action('tool.move', { keys: ['v'] }))
    renderOnBoard(<ShortcutsSheet />)

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
    renderOnBoard(<ShortcutsSheet />)

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
      renderOnBoard(
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

  describe('on the home view', () => {
    function renderHomeSheet() {
      render(
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <ShortcutsSheet />
        </Router>,
      )
      act(() => openOverlay('shortcuts'))
      return screen.findByRole('dialog')
    }

    afterEach(() => {
      setCharacterKeys(true)
    })

    it('lists the project keys in place of the board sections', async () => {
      const dialog = await renderHomeSheet()

      expect(
        within(dialog)
          .getAllByRole('heading', { level: 3 })
          .map((heading) => heading.textContent),
      ).toEqual(['Projects', 'General'])
    })

    it('shows no Nudge, Resize, or tool rows', async () => {
      const dialog = await renderHomeSheet()

      expect(
        ['Nudge', 'Resize', 'Move', 'All projects'].map((label) =>
          within(dialog).queryByText(label),
        ),
      ).toEqual([null, null, null, null])
    })

    it('draws H J K L faint while single-key shortcuts are off', async () => {
      setCharacterKeys(false)
      await renderHomeSheet()

      const chips = [
        ...row('Move between projects').querySelectorAll('kbd kbd'),
      ]

      expect(
        chips.map((chip) => [chip.textContent, chip.hasAttribute('data-off')]),
      ).toEqual([
        ['Arrows', false],
        ['H J K L', true],
      ])
    })

    it('keeps the palette key a board lists', async () => {
      cleanups.push(registerPaletteActions())
      await renderHomeSheet()

      expect(row('This list').querySelector('kbd')?.textContent).toBe('?')
    })
  })

  it('opens on ?', async () => {
    cleanups.push(registerPaletteActions(), bindKeys(window))
    renderOnBoard(<ShortcutsSheet />)

    await userEvent.keyboard('{Shift>}?{/Shift}')

    expect(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument()
  })

  it('shows its own key as ?', async () => {
    cleanups.push(registerPaletteActions())
    renderOnBoard(<ShortcutsSheet />)

    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    expect(row('This list').querySelector('kbd')?.textContent).toBe('?')
  })

  it('closes on Esc without reaching the keys bound to it', async () => {
    const exitPlay = action('mode.exitPlay', { keys: ['Escape'] })
    register(exitPlay)
    cleanups.push(bindKeys(window))
    renderOnBoard(<ShortcutsSheet />)
    act(() => openOverlay('shortcuts'))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(exitPlay.runs).toBe(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
