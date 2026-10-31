import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

/** Where the list persists, in the `frameboard.home.layout` form. */
export const RECENT_KEY = 'frameboard.palette.recent'

/** How many action ids the Recent group keeps, newest first. */
const KEPT = 5

/** Null when the browser refuses storage, which leaves Recent empty. */
export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'> | null

export interface RecentState {
  /** The ids of the actions last run from the palette, newest first. */
  ids: readonly string[]
  /** Puts `id` first, keeping it only when storage takes the write. */
  record: (id: string) => void
}

export type RecentStore = StoreApi<RecentState>

/**
 * The actions run from the palette, kept across reloads in `storage`. A
 * refused write keeps nothing, so a blocked store shows no Recent group
 * rather than one that forgets on reload.
 */
export function createRecentStore(storage: RecentStorage): RecentStore {
  return createStore<RecentState>()((set, get) => ({
    ids: readIds(storage),
    record: (id) => {
      const ids = [id, ...get().ids.filter((kept) => kept !== id)].slice(
        0,
        KEPT,
      )
      if (writeIds(storage, ids)) set({ ids })
    },
  }))
}

export function useRecent(store: RecentStore = recentStore): readonly string[] {
  return useStore(store, (state) => state.ids)
}

export function recordRecent(
  id: string,
  store: RecentStore = recentStore,
): void {
  store.getState().record(id)
}

function readIds(storage: RecentStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string').slice(0, KEPT)
      : []
  } catch {
    return []
  }
}

function writeIds(storage: RecentStorage, ids: readonly string[]): boolean {
  if (!storage) return false
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

function windowStorage(): RecentStorage {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The one list the palette reads and every run from it adds to. */
export const recentStore = createRecentStore(windowStorage())
