import { Images, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

import { registerActions } from '@/client/actions/registry'

import { closeFind } from '../find/actions'
import { leftTabStore } from '../left-panel/tab-store'
import { modeStore } from '../mode'

/** What the dialog shows, a search for free media or a generated image. */
export type SourcingView = 'find' | 'generate'

interface SourcingDialogState {
  open: boolean
  view: SourcingView
  /** The view it opened on, whose button takes the focus back. */
  opener: SourcingView
  /** An insert is out, which holds the dialog open until it lands or is refused. */
  inserting: boolean
  /** Why the last insert was refused. */
  refusal: string | null
}

/** The one dialog Find and Generate share, held here so the palette can open it. */
export const sourcingDialogStore = createStore<SourcingDialogState>()(() => ({
  open: false,
  view: 'find',
  opener: 'find',
  inserting: false,
  refusal: null,
}))

export function openSourcing(view: SourcingView): void {
  sourcingDialogStore.setState({
    open: true,
    view,
    opener: view,
    refusal: null,
  })
}

/** Closes the dialog, unless an insert is out, which closes it once it lands. */
export function closeSourcing(): void {
  sourcingDialogStore.setState((state) =>
    state.inserting ? state : { open: false, refusal: null },
  )
}

/**
 * Registers Find media and Generate media in the palette, each opening the
 * dialog over the Assets tab, in a tab that may not write too, since looking
 * writes nothing. The dialog closes with the project it opened in.
 */
export function useSourcingActions(project: string): void {
  useEffect(() => {
    const show = (view: SourcingView) => {
      // The dialog hangs off the Assets tab, so whatever hides that tab goes first.
      modeStore.setState({ hideUi: false })
      closeFind()
      // With the project, or a panel mounting into another one resets its tab.
      leftTabStore.setState({ tab: 'assets', project })
      openSourcing(view)
    }
    const unregister = registerActions([
      {
        id: 'assets.find',
        label: 'Find media',
        group: 'assets',
        command: {
          label: 'Find media',
          icon: Images,
          keywords: ['image', 'photo', 'model', 'openverse', 'poly haven'],
        },
        run: () => show('find'),
      },
      {
        id: 'assets.generate',
        label: 'Generate media',
        group: 'assets',
        command: {
          label: 'Generate media',
          icon: Sparkles,
          keywords: ['image', 'prompt'],
        },
        run: () => show('generate'),
      },
    ])
    return () => {
      unregister()
      // Past an insert too, whose refusal toasts once the dialog is gone.
      sourcingDialogStore.setState({ open: false, refusal: null })
    }
  }, [project])
}
