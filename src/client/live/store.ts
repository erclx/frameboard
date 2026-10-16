import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { Finding } from '@/shared/records/check'
import type { ListResult } from '@/shared/records/list'

export interface LiveState {
  /** The last board the server sent, null until the first arrives. */
  board: ListResult | null
  /** Per-frame reload counters by ref, absent meaning zero. */
  reloads: Readonly<Record<string, number>>
  connected: boolean
  /** The frame `show` last named, until its page's canvas brings it into view. */
  focus: string | null
  /** Check findings by frame ref, absent meaning none reported yet. */
  findings: Readonly<Record<string, readonly Finding[]>>
}

export type LiveStore = StoreApi<LiveState>

export function createLiveStore(): LiveStore {
  return createStore<LiveState>()(() => ({
    board: null,
    reloads: {},
    connected: false,
    focus: null,
    findings: {},
  }))
}

/** Replaces the board, dropping the counters and findings of frames it no longer holds. */
export function receiveBoard(store: LiveStore, board: ListResult): void {
  const refs = new Set(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
    ),
  )
  const held = <T>(byRef: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(byRef).filter(([ref]) => refs.has(ref)))
  const { reloads, findings } = store.getState()
  store.setState({ board, reloads: held(reloads), findings: held(findings) })
}

/** Replaces the findings of each frame named, an empty list clearing one. */
export function receiveFindings(
  store: LiveStore,
  findings: Readonly<Record<string, readonly Finding[]>>,
): void {
  store.setState({ findings: { ...store.getState().findings, ...findings } })
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
