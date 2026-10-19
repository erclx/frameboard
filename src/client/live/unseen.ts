import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { FrameChange } from '@/shared/records/changes'
import type { ListResult } from '@/shared/records/list'

/** Where the hashes this browser has seen are kept, by frame ref. */
export const SEEN_KEY = 'frameboard.seen'

/** The part of `localStorage` the store reads and writes, any call of which may throw. */
export interface SeenStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface UnseenState {
  /** The latest change of each frame the developer has not looked at since, by ref. */
  unseen: Readonly<Record<string, FrameChange>>
  /** The content hash this browser last looked at, by frame ref. */
  seen: Readonly<Record<string, string>>
  /** The frame the toast is on, which Show zooms to and Next steps from. */
  cursor: string | null
}

export interface UnseenStore extends StoreApi<UnseenState> {
  storage: SeenStorage | null
}

/**
 * What an agent changed and the developer has not yet seen. Seen state lives
 * in the browser rather than the board folder, so a blocked store only
 * forgets it across reloads.
 */
export function createUnseenStore(storage: SeenStorage | null): UnseenStore {
  const store = createStore<UnseenState>()(() => ({
    unseen: {},
    seen: readSeen(storage),
    cursor: null,
  }))
  return Object.assign(store, { storage })
}

/** Marks each change's frame, unless this browser already saw the hash it left. */
export function receiveChanges(
  store: UnseenStore,
  changes: readonly FrameChange[],
): void {
  const { unseen, seen } = store.getState()
  const next = { ...unseen }
  // Changes arrive oldest first, so a seen one also clears an older one the
  // same replay marked before it.
  for (const change of changes) {
    if (seen[change.frame] === change.hash) delete next[change.frame]
    else next[change.frame] = change
  }
  store.setState({ unseen: next })
}

/** Clears a frame's mark and remembers the hash looked at. */
export function markSeen(store: UnseenStore, ref: string): void {
  const { unseen, seen } = store.getState()
  const change = unseen[ref]
  if (!change) return
  const { [ref]: _, ...rest } = unseen
  const nextSeen = { ...seen, [ref]: change.hash }
  store.setState({ unseen: rest, seen: nextSeen })
  writeSeen(store.storage, nextSeen)
}

/** Drops the marks of frames the board no longer holds. */
export function pruneUnseen(store: UnseenStore, board: ListResult): void {
  const refs = new Set(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
    ),
  )
  const { unseen } = store.getState()
  const kept = Object.fromEntries(
    Object.entries(unseen).filter(([ref]) => refs.has(ref)),
  )
  if (Object.keys(kept).length === Object.keys(unseen).length) return
  store.setState({ unseen: kept })
}

/** Moves the toast to a frame. */
export function pointAt(store: UnseenStore, ref: string | null): void {
  store.setState({ cursor: ref })
}

/** How many unseen frames sit under a page ref or a project name. */
export function unseenUnder(
  unseen: Readonly<Record<string, FrameChange>>,
  ref: string,
): number {
  const prefix = `${ref}/`
  return Object.keys(unseen).filter((frame) => frame.startsWith(prefix)).length
}

/** The unseen changes in the order they landed. */
export function inLandingOrder(
  unseen: Readonly<Record<string, FrameChange>>,
): FrameChange[] {
  return Object.values(unseen).sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  )
}

/** The change landing after `from`'s, wrapping, or the first when `from` holds none. */
export function nextUnseen(
  unseen: Readonly<Record<string, FrameChange>>,
  from: string | null,
): FrameChange | null {
  const ordered = inLandingOrder(unseen)
  const at = ordered.findIndex((change) => change.frame === from)
  return ordered[(at + 1) % ordered.length] ?? null
}

function readSeen(storage: SeenStorage | null): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SEEN_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function writeSeen(
  storage: SeenStorage | null,
  seen: Readonly<Record<string, string>>,
): void {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // A browser refusing storage keeps what was seen for this tab's life.
  }
}

function windowStorage(): SeenStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The one store the socket feeds and the board and home view read. */
export const unseenStore = createUnseenStore(windowStorage())

export function useUnseen<T>(selector: (state: UnseenState) => T): T {
  return useStore(unseenStore, selector)
}
