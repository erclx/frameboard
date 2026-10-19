import { CircleHelp } from 'lucide-react'

import { type Action, registerActions } from '@/client/actions/registry'

import { openOverlay } from './overlay'

/**
 * Registers `palette.open` and `help.shortcuts` at the app level, since the
 * home view opens both. `?` binds the symbol, which a layout where it is not
 * Shift+Slash still types. Returns the function that removes them.
 */
export function registerPaletteActions(): () => void {
  const actions: Action[] = [
    {
      id: 'palette.open',
      label: 'Command palette',
      group: 'help',
      keys: ['$mod+KeyK'],
      run: () => openOverlay('commands'),
    },
    {
      id: 'help.shortcuts',
      label: 'Keyboard shortcuts',
      group: 'help',
      keys: ['Shift+?'],
      run: () => openOverlay('shortcuts'),
      command: { label: 'Keyboard shortcuts', icon: CircleHelp },
    },
  ]
  return registerActions(actions)
}
