import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/**
 * The frame whose findings popover is open, null when none is. The hit layer
 * opens it, since a press on the badge lands there rather than on the badge.
 */
const openStore = createStore<{ ref: string | null }>()(() => ({ ref: null }))

export function openFindings(ref: string | null): void {
  openStore.setState({ ref })
}

export function useFindingsOpen(ref: string): boolean {
  return useStore(openStore, (state) => state.ref === ref)
}
