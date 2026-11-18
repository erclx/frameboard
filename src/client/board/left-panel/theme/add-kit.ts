import { Palette } from 'lucide-react'
import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'

import { modeStore } from '../../mode'
import { leftTabStore } from '../tab-store'

/** Whether the Theme tab's Add kit list is open, so the palette's Add kit can open it. */
export const addKitStore = createStore<{ open: boolean }>()(() => ({
  open: false,
}))

/** The note Ask the agent opens on the selected frame. */
export const ASK_FOR_KIT =
  'Write a new design kit for this project from this frame’s look, then add it to the project.'

/**
 * Registers Add kit in the palette, opening the Theme tab and its Add kit
 * list, enabled while the tab writes.
 */
export function useAddKitAction(): void {
  useEffect(() => {
    const unregister = registerActions([
      {
        id: 'theme.addKit',
        label: 'Add kit',
        group: 'theme',
        command: { label: 'Add kit', icon: Palette, keywords: ['design kit'] },
        enabled: () => liveStore.getState().canWrite,
        run: () => {
          // The list sits in the left panel, so a hidden UI comes back to show it.
          modeStore.setState({ hideUi: false })
          leftTabStore.setState({ tab: 'theme' })
          addKitStore.setState({ open: true })
        },
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite !== previous.canWrite) refreshActions()
    })
    return () => {
      unsubscribe()
      unregister()
    }
  }, [])
}
