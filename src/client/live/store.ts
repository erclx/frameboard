import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { ListResult } from '@/shared/records/list'

export interface LiveState {
  /** The last board the server sent, null until the first arrives. */
  board: ListResult | null
  /** Per-frame reload counters by ref, absent meaning zero. */
  reloads: Readonly<Record<string, number>>
  connected: boolean
}

export type LiveStore = StoreApi<LiveState>

export function createLiveStore(): LiveStore {
  return createStore<LiveState>()(() => ({
    board: null,
    reloads: {},
    connected: false,
  }))
}

/** Replaces the board, dropping the counters of frames it no longer holds. */
export function receiveBoard(store: LiveStore, board: ListResult): void {
  const refs = new Set(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
    ),
  )
  const reloads = Object.fromEntries(
    Object.entries(store.getState().reloads).filter(([ref]) => refs.has(ref)),
  )
  store.setState({ board, reloads })
}

/** Bumps each frame's counter, which reloads its iframe alone. */
export function receiveReload(store: LiveStore, refs: string[]): void {
  const reloads = { ...store.getState().reloads }
  for (const ref of refs) reloads[ref] = (reloads[ref] ?? 0) + 1
  store.setState({ reloads })
}

/** The one store the app's socket writes and its screens read. */
export const liveStore = createLiveStore()

export function useLive<T>(selector: (state: LiveState) => T): T {
  return useStore(liveStore, selector)
}
