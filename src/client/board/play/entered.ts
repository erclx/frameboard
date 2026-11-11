import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/**
 * The one frame Play hands the wheel, clicks, and keys to, by ref. Every
 * other frame sits under the shield, so the board keeps the wheel over it.
 * Nothing selects in Play, so entering never touches the selection.
 */
export const enteredStore = createStore<{ ref: string | null }>()(() => ({
  ref: null,
}))

export function enterFrame(ref: string): void {
  if (enteredStore.getState().ref !== ref) enteredStore.setState({ ref })
}

export function leaveFrame(): void {
  if (enteredStore.getState().ref !== null) enteredStore.setState({ ref: null })
}

export function useEntered(ref: string): boolean {
  return useStore(enteredStore, (state) => state.ref === ref)
}
