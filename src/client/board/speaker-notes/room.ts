import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** The screen height each shown strip takes under its frame, by ref, which the size chip stands past. */
export const stripRoomStore = createStore<{
  heights: Readonly<Record<string, number>>
}>()(() => ({ heights: {} }))

/** The screen pixels the strip takes under `ref`, zero while it shows none there. */
export function useStripRoom(ref: string | null): number {
  return useStore(stripRoomStore, (state) =>
    ref === null ? 0 : (state.heights[ref] ?? 0),
  )
}

export function setStripRoom(ref: string, height: number): void {
  const { heights } = stripRoomStore.getState()
  if (heights[ref] === height) return
  stripRoomStore.setState({ heights: { ...heights, [ref]: height } })
}

export function clearStripRoom(ref: string): void {
  const { [ref]: _gone, ...rest } = stripRoomStore.getState().heights
  stripRoomStore.setState({ heights: rest })
}
