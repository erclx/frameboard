import { CircleHelp, Keyboard } from 'lucide-react'

import {
  characterKeysOn,
  characterKeysStore,
  setCharacterKeys,
} from '@/client/actions/character-keys'
import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'

import { openOverlay } from './overlay'

/**
 * Registers `palette.open`, `help.shortcuts`, and `help.characterKeys` at the
 * app level, since the home view opens all three. `?` binds the symbol, which
 * a layout where it is not Shift+Slash still types. Returns the function that
 * removes them.
 */
export function registerPaletteActions(): () => void {
  const actions: Action[] = [
    {
      id: 'palette.open',
      label: 'Command palette',
      group: 'help',
      palette: false,
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
    {
      id: 'help.characterKeys',
      label: 'Single-key shortcuts',
      group: 'help',
      run: () => setCharacterKeys(!characterKeysOn()),
      checked: characterKeysOn,
      // A getter, so the row names what a press does next as the switch moves.
      command: {
        get label() {
          return characterKeysOn()
            ? 'Turn single-key shortcuts off'
            : 'Turn single-key shortcuts on'
        },
        icon: Keyboard,
      },
    },
  ]
  const unregister = registerActions(actions)
  const unsubscribe = characterKeysStore.subscribe(refreshActions)
  return () => {
    unsubscribe()
    unregister()
  }
}
