import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** The screen height the shown strip takes under its frame, which the size chip stands past. */
export const stripRoomStore = createStore<{
  ref: string | null
  height: number
}>()(() => ({ ref: null, height: 0 }))

/** The screen pixels the strip takes under `ref`, zero while it shows none there. */
export function useStripRoom(ref: string | null): number {
  return useStore(stripRoomStore, (state) =>
    ref !== null && state.ref === ref ? state.height : 0,
  )
}
