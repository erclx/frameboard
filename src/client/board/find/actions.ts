import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { type Action, registerActions } from '@/client/actions/registry'

import { type ModeStore, modeStore } from '../mode'

export interface FindState {
  /** The find panel stands in for the left panel's tabs. */
  open: boolean
  /** Bumped on every open, so a Cmd+F while open takes the field's focus again. */
  focusRequest: number
}

export type FindStore = StoreApi<FindState>

export function createFindStore(): FindStore {
  return createStore<FindState>()(() => ({ open: false, focusRequest: 0 }))
}

/** The board's one find store. */
export const findStore = createFindStore()

export function useFind<T>(selector: (state: FindState) => T): T {
  return useStore(findStore, selector)
}

/** Opens find with the panels shown, since the field lives in the left panel. */
export function openFind(
  store: FindStore = findStore,
  mode: ModeStore = modeStore,
): void {
  mode.setState({ hideUi: false })
  store.setState((state) => ({
    open: true,
    focusRequest: state.focusRequest + 1,
  }))
}

export function closeFind(store: FindStore = findStore): void {
  store.setState({ open: false })
}

/**
 * Registers `find.open` on Cmd+F while a board is mounted, and closes find
 * when the board unmounts, so the home view and the next board open on the
 * layers.
 */
export function useFindActions(
  store: FindStore = findStore,
  mode: ModeStore = modeStore,
): void {
  useEffect(() => {
    const actions: Action[] = [
      {
        id: 'find.open',
        label: 'Find',
        group: 'tool',
        keys: ['$mod+KeyF'],
        run: () => openFind(store, mode),
        command: { label: 'Find frames, elements, and text', icon: Search },
      },
    ]
    const unregister = registerActions(actions)
    return () => {
      unregister()
      closeFind(store)
    }
  }, [store, mode])
}
