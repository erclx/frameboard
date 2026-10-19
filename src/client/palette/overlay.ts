import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

export type Overlay = 'commands' | 'shortcuts'

/** Which of the two overlays is open, one at a time, null with neither. */
export const overlayStore = createStore<{ open: Overlay | null }>()(() => ({
  open: null,
}))

export function openOverlay(open: Overlay | null): void {
  overlayStore.setState({ open })
}

export function useOverlay(): Overlay | null {
  return useStore(overlayStore, (state) => state.open)
}
