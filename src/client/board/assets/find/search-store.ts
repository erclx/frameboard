import { createStore } from 'zustand/vanilla'

import type { ImageFind, ModelFind } from '@/shared/records/sourcing'

/** What Find searches, picked in the kind menu. */
export type Kind = 'images' | 'models'

export type SearchState =
  | { state: 'idle' }
  | { state: 'searching'; query: string }
  | { state: 'done'; find: ImageFind }
  | { state: 'models'; find: ModelFind }
  | { state: 'failed'; status: number | null; query: string }

/** One project's Find: the field, the filter, the last search, and the result picked from it. */
export interface FindSearch {
  text: string
  kind: Kind
  credited: boolean
  search: SearchState
  /** The result the preview shows, by its source id, null until a search finds one. */
  picked: string | null
}

export const EMPTY_SEARCH: FindSearch = {
  text: '',
  kind: 'images',
  credited: false,
  search: { state: 'idle' },
  picked: null,
}

/**
 * Find by project, held here rather than in the view so a search outlives the
 * dialog closing and a board reload starts it empty.
 */
export const searchStore = createStore<Record<string, FindSearch>>()(() => ({}))

const running = new Map<string, AbortController>()

export function updateSearch(
  project: string,
  change: Partial<FindSearch>,
): void {
  searchStore.setState((current) => ({
    ...current,
    [project]: { ...(current[project] ?? EMPTY_SEARCH), ...change },
  }))
}

/** A signal for the project's next search, aborting the one before it, so an older answer never replaces a newer. */
export function nextSearch(project: string): AbortSignal {
  stopSearch(project)
  const controller = new AbortController()
  running.set(project, controller)
  return controller.signal
}

export function stopSearch(project: string): void {
  running.get(project)?.abort()
  running.delete(project)
}

/** Forgets every search, for a test to start clean. */
export function resetSearches(): void {
  for (const controller of running.values()) controller.abort()
  running.clear()
  searchStore.setState({}, true)
}
