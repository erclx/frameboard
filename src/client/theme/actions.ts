import { SunMoon } from 'lucide-react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'

import {
  chooseTheme,
  type ThemeChoice,
  type ThemeStore,
  themeStore,
  toggleTheme,
} from './store'

const CHOICES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
]

/**
 * Registers `theme.toggle`, which the toolbar and the home header draw, and
 * the `theme` group the avatar menu lists as radio rows. The toggle carries
 * no `checked`, so the toolbar never draws it pressed. Returns the function
 * that removes them.
 */
export function registerThemeActions(
  store: ThemeStore = themeStore,
): () => void {
  const actions: Action[] = [
    {
      id: 'theme.toggle',
      label: 'Theme',
      group: 'view',
      command: { label: 'Toggle theme', icon: SunMoon },
      run: () => toggleTheme(store),
    },
    ...CHOICES.map(({ choice, label }) => ({
      id: `theme.${choice}`,
      label,
      group: 'theme',
      run: () => chooseTheme(choice, store),
      checked: () => store.getState().choice === choice,
    })),
  ]
  const unregister = registerActions(actions)
  const unsubscribe = store.subscribe(refreshActions)
  return () => {
    unsubscribe()
    unregister()
  }
}
