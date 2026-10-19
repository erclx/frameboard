import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { LiveStore } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'

import type { ModeStore } from './mode'

/**
 * One element inside a selected frame, in the edit address's terms: its
 * file index and the hash of the bytes the frame rendered when it was picked.
 */
export interface ElementKey {
  /** The frame ref, always the one selected frame. */
  frame: string
  index: number
  hash: string
}

/**
 * The frames selected on one page, by ref. Later rows extend it with
 * optional keys and keep `frames` as it is.
 */
export interface SelectionState {
  /** The page the frames sit on, null with nothing selected. */
  page: string | null
  frames: readonly string[]
  /** An element inside the one selected frame, absent or null when the frame itself is selected. */
  element?: ElementKey | null
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
  store.setState({ page, frames: [...new Set(frames)], element: null })
}

/** Selects one element, and with it its frame alone, on `page`. */
export function selectElement(
  store: SelectionStore,
  page: string,
  element: ElementKey,
): void {
  store.setState({ page, frames: [element.frame], element })
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
  store.setState({
    page: next.length === 0 ? null : page,
    frames: next,
    element: null,
  })
}

export function clear(store: SelectionStore): void {
  const { page, frames, element } = store.getState()
  if (page === null && frames.length === 0 && !element) return
  store.setState({ page: null, frames: [], element: null })
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
  else store.setState({ frames: kept, element: null })
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

/** Writes in flight that will answer a frame's new hash, by frame ref, or under null for any frame. */
const awaiting = new Map<string | null, number>()

/**
 * Marks a write in flight whose answer names the hash a frame now holds, a
 * hand edit for one frame or an undo for any, and returns the function that
 * ends it. A frame's reload can land before that answer, showing bytes the
 * selection's hash does not name yet, so while one is in flight the frame
 * leaves its hash check to the write.
 */
export function awaitHash(ref: string | null): () => void {
  awaiting.set(ref, (awaiting.get(ref) ?? 0) + 1)
  let done = false
  return () => {
    if (done) return
    done = true
    awaiting.set(ref, (awaiting.get(ref) ?? 1) - 1)
  }
}

/** The hashes of bytes the board's own writes left each frame at, newest last. */
const written = new Map<string, string[]>()

/** How many of a frame's own hashes are kept, past which the oldest is forgotten. */
const WRITTEN_CAP = 100

/** Notes bytes a write of the board's own left a frame at, so a late reload of them keeps the element. */
export function rememberHash(ref: string, hash: string): void {
  const held = (written.get(ref) ?? []).filter((known) => known !== hash)
  written.set(ref, [...held, hash].slice(-WRITTEN_CAP))
}

/**
 * Whether a frame showing `hash` may keep its selected element, though the
 * selection names other bytes: a write in flight will answer the frame's
 * hash, or the frame shows bytes one of the board's own writes left it at,
 * whose reload lagged a later write and is followed by that one's.
 */
export function awaitingHash(ref: string, hash?: string | null): boolean {
  if ((awaiting.get(ref) ?? 0) > 0 || (awaiting.get(null) ?? 0) > 0) {
    return true
  }
  return hash != null && (written.get(ref)?.includes(hash) ?? false)
}

/**
 * The hash check a frame skipped while a write was in flight, run once the
 * write was refused. The refusal means the file holds bytes other than the
 * ones the selection names, so a frame already showing other bytes drops the
 * element to the frame, as its own check would have. A frame still showing
 * them has that reload to come, which runs its own check. A write that
 * landed needs none, since the frame's last reload shows the bytes it
 * answered, however many of the board's own writes it lags meanwhile.
 */
export function settleRefused(
  store: SelectionStore,
  shown: (ref: string) => string | null,
): void {
  const { page, element } = store.getState()
  if (!page || !element || awaitingHash(element.frame)) return
  const hash = shown(element.frame)
  if (hash !== null && hash !== element.hash)
    select(store, page, [element.frame])
}

/** The board's one selection, which this row writes and later rows read and extend. */
export const selectionStore = createSelectionStore()

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(selectionStore, selector)
}
