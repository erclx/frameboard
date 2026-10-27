import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { FrameChange } from '@/shared/records/changes'
import type { ListResult } from '@/shared/records/list'

import { movedKeys, movedRef } from './store'

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
  /**
   * The content hash each frame held before the first change since the
   * developer last looked, which compare shows as the before side. It
   * outlives the look and moves on the next change after it.
   */
  base: Readonly<Record<string, string>>
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
    base: {},
  }))
  return Object.assign(store, { storage })
}

/**
 * Marks each change's frame, unless this browser already saw the hash it
 * left, and moves its base when the change opens a run. A change opens one
 * when the frame holds no mark, so the base is read off the log's `before`
 * hashes and a replay of the same log lands on the same base.
 */
export function receiveChanges(
  store: UnseenStore,
  changes: readonly FrameChange[],
): void {
  const { unseen, seen, base } = store.getState()
  const next = { ...unseen }
  const nextBase = { ...base }
  // Changes arrive oldest first, so a seen one also clears an older one the
  // same replay marked before it.
  for (const change of changes) {
    if (!next[change.frame]) {
      if (change.before) nextBase[change.frame] = change.before
      else delete nextBase[change.frame]
    }
    if (seen[change.frame] === change.hash) delete next[change.frame]
    else next[change.frame] = change
  }
  store.setState({ unseen: next, base: nextBase })
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

/** Drops the marks and bases of frames the board no longer holds. */
export function pruneUnseen(store: UnseenStore, board: ListResult): void {
  const refs = new Set(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
    ),
  )
  const { unseen, base } = store.getState()
  const kept = keptOn(unseen, refs)
  const keptBase = keptOn(base, refs)
  if (kept === unseen && keptBase === base) return
  store.setState({ unseen: kept, base: keptBase })
}

/**
 * Moves every mark, seen hash, base, and the toast under a renamed project
 * or page to the new refs, so a rename neither shows a frame as new nor
 * forgets one the developer has not looked at.
 */
export function renameUnseen(
  store: UnseenStore,
  before: string,
  after: string,
): void {
  const { unseen, seen, base, cursor } = store.getState()
  const moved = Object.fromEntries(
    Object.entries(movedKeys(unseen, before, after)).map(([ref, change]) => [
      ref,
      { ...change, frame: ref },
    ]),
  )
  const nextSeen = movedKeys(seen, before, after)
  store.setState({
    unseen: moved,
    seen: nextSeen,
    base: movedKeys(base, before, after),
    cursor: cursor === null ? null : movedRef(cursor, before, after),
  })
  writeSeen(store.storage, nextSeen)
}

/** Drops a frame's base once the server no longer holds its version. */
export function dropBase(store: UnseenStore, ref: string): void {
  const { base } = store.getState()
  if (!(ref in base)) return
  const { [ref]: _, ...rest } = base
  store.setState({ base: rest })
}

/** The entries under refs the board holds, or `byRef` itself when it holds them all. */
function keptOn<T>(
  byRef: Readonly<Record<string, T>>,
  refs: ReadonlySet<string>,
): Readonly<Record<string, T>> {
  const kept = Object.fromEntries(
    Object.entries(byRef).filter(([ref]) => refs.has(ref)),
  )
  return Object.keys(kept).length === Object.keys(byRef).length ? byRef : kept
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

/** The change landing before `from`'s, wrapping, or the last when `from` holds none. */
export function previousUnseen(
  unseen: Readonly<Record<string, FrameChange>>,
  from: string | null,
): FrameChange | null {
  const ordered = inLandingOrder(unseen)
  const at = ordered.findIndex((change) => change.frame === from)
  const back = at < 0 ? ordered.length - 1 : at - 1 + ordered.length
  return ordered[back % ordered.length] ?? null
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
