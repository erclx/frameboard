import { type LucideIcon, Monitor, Moon, Sun, SunMoon } from 'lucide-react'

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

const CHOICES: readonly {
  choice: ThemeChoice
  label: string
  icon: LucideIcon
}[] = [
  { choice: 'system', label: 'System', icon: Monitor },
  { choice: 'light', label: 'Light', icon: Sun },
  { choice: 'dark', label: 'Dark', icon: Moon },
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
      command: {
        label: 'Toggle theme',
        icon: SunMoon,
        keywords: ['dark', 'light', 'mode'],
      },
      run: () => toggleTheme(store),
    },
    ...CHOICES.map(({ choice, label, icon }) => ({
      id: `theme.${choice}`,
      label,
      group: 'theme',
      command: {
        label: `Use the ${label.toLowerCase()} theme`,
        icon,
        keywords: ['appearance', 'mode'],
      },
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
