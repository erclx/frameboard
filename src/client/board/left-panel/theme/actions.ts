import { Palette, SwatchBook } from 'lucide-react'
import { useEffect } from 'react'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'

import { closeFind } from '../../find/actions'
import { modeStore } from '../../mode'
import { leftTabStore } from '../tab-store'
import { closeTheme, openTheme, themeDialogStore } from './dialog-store'

/**
 * Registers Add kit and Edit theme in the palette, each opening the Theme
 * dialog on Kits over its tab. Add kit opens its list too and takes a writing
 * tab, while Edit theme only looks. The dialog closes with the project it
 * opened in.
 */
export function useThemeActions(project: string): void {
  useEffect(() => {
    const show = () => {
      // The dialog hangs off the Theme tab, so whatever hides that tab goes first.
      modeStore.setState({ hideUi: false })
      closeFind()
      // With the project, or a panel mounting into another one resets its tab.
      leftTabStore.setState({ tab: 'theme', project })
      openTheme('kits', 'edit')
    }
    const unregister = registerActions([
      {
        id: 'theme.addKit',
        label: 'Add kit',
        // Never `theme`, since the avatar menu lists that whole group as its theme choices.
        group: 'look',
        command: { label: 'Add kit', icon: Palette, keywords: ['design kit'] },
        enabled: () => liveStore.getState().canWrite,
        run: () => {
          show()
          themeDialogStore.setState({ addingKit: true })
        },
      },
      {
        id: 'theme.edit',
        label: 'Edit theme',
        group: 'look',
        command: {
          label: 'Edit theme',
          icon: SwatchBook,
          keywords: ['tokens', 'colors', 'fonts', 'kits', 'radius'],
        },
        run: show,
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite !== previous.canWrite) refreshActions()
    })
    return () => {
      unsubscribe()
      unregister()
      closeTheme()
    }
  }, [project])
}
