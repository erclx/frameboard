import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { LiveStore } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'

import type { ModeStore } from './mode'

/**
 * The frames selected on one page, by ref. Later rows extend it with
 * optional keys, such as an element, and keep `frames` as it is.
 */
export interface SelectionState {
  /** The page the frames sit on, null with nothing selected. */
  page: string | null
  frames: readonly string[]
}

export type SelectionStore = StoreApi<SelectionState>

export function createSelectionStore(): SelectionStore {
  return createStore<SelectionState>()(() => ({ page: null, frames: [] }))
}

/** Replaces the selection with these frames on `page`. */
export function select(
  store: SelectionStore,
  page: string,
  frames: readonly string[],
): void {
  store.setState({ page, frames: [...new Set(frames)] })
}

/** Adds a frame to the selection or takes it out, starting over on another page. */
export function toggle(store: SelectionStore, page: string, ref: string): void {
  const { page: current, frames } = store.getState()
  if (current !== page) {
    select(store, page, [ref])
    return
  }
  const next = frames.includes(ref)
    ? frames.filter((frame) => frame !== ref)
    : [...frames, ref]
  store.setState({ page: next.length === 0 ? null : page, frames: next })
}

export function clear(store: SelectionStore): void {
  const { page, frames } = store.getState()
  if (page === null && frames.length === 0) return
  store.setState({ page: null, frames: [] })
}

/**
 * Keeps only the selected frames the board still shows on the selected
 * page, so a deleted, hidden, or moved frame never stays selected.
 */
export function pruneSelection(store: SelectionStore, board: ListResult): void {
  const { page, frames } = store.getState()
  if (page === null) return
  const shown = new Set(
    board.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === page)
      ?.frames.filter((frame) => !frame.hidden)
      .map((frame) => frame.ref),
  )
  const kept = frames.filter((frame) => shown.has(frame))
  if (kept.length === frames.length) return
  if (kept.length === 0) clear(store)
  else store.setState({ frames: kept })
}

/**
 * Ties the selection to the page a canvas shows while it is mounted:
 * another page's selection clears, Play clears it, and every board the
 * server sends prunes it. Returns the function that stops following.
 */
export function followSelection(
  store: SelectionStore,
  page: string,
  live: LiveStore,
  mode: ModeStore,
): () => void {
  if (store.getState().page !== page) clear(store)
  const board = live.getState().board
  if (board) pruneSelection(store, board)
  const unsubscribeLive = live.subscribe((state, previous) => {
    if (state.board && state.board !== previous.board) {
      pruneSelection(store, state.board)
    }
  })
  const unsubscribeMode = mode.subscribe((state) => {
    if (state.mode === 'play') clear(store)
  })
  return () => {
    unsubscribeMode()
    unsubscribeLive()
  }
}

/** The board's one selection, which this row writes and later rows read and extend. */
export const selectionStore = createSelectionStore()

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(selectionStore, selector)
}
