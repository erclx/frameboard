import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type { ListResult } from '@/shared/records/list'
import type { BoardNote, Listener } from '@/shared/records/notes'
import type { Theme } from '@/shared/theme'

export interface LiveState {
  /** The last board the server sent, null until the first arrives. */
  board: ListResult | null
  /** Per-frame reload counters by ref, absent meaning zero. */
  reloads: Readonly<Record<string, number>>
  connected: boolean
  /** Whether this tab may write, false until the server's `access` answer and again whenever the socket drops. */
  canWrite: boolean
  /** Whether the server has answered `canWrite` since the socket last opened, so a reading tab can tell "not yet" from "no". */
  accessKnown: boolean
  /** The frame `show` last named, until its page's canvas brings it into view. */
  focus: string | null
  /** Check findings by frame ref, absent meaning none reported yet. */
  findings: Readonly<Record<string, readonly Finding[]>>
  /** Each page's notes by `<project>/<page>` ref, absent meaning none. */
  notes: Readonly<Record<string, readonly BoardNote[]>>
  /** The sessions following their inbox, which a note can be sent to. */
  listeners: readonly Listener[]
  /** How many steps the server can undo and redo, zero until its `history` message. */
  history: { undo: number; redo: number }
  /** The live claims by frame ref, absent meaning nobody holds the frame. */
  claims: Readonly<Record<string, Claim>>
  /** Thumbnail stamps by theme then frame ref, absent meaning none rendered yet. */
  thumbnails: Readonly<Record<Theme, Readonly<Record<string, string>>>>
}

export type LiveStore = StoreApi<LiveState>

export function createLiveStore(): LiveStore {
  return createStore<LiveState>()(() => ({
    board: null,
    reloads: {},
    connected: false,
    canWrite: false,
    accessKnown: false,
    focus: null,
    findings: {},
    notes: {},
    listeners: [],
    history: { undo: 0, redo: 0 },
    claims: {},
    thumbnails: { light: {}, dark: {} },
  }))
}

/**
 * Replaces the board, dropping the counters, findings, and claims of frames
 * it no longer holds and the notes of pages it no longer holds.
 */
export function receiveBoard(store: LiveStore, board: ListResult): void {
  const pages = board.projects.flatMap((project) => project.pages)
  const refs = new Set(
    pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
  )
  const pageRefs = new Set(pages.map((page) => page.ref))
  const held = <T>(byRef: Readonly<Record<string, T>>, keep: Set<string>) =>
    Object.fromEntries(Object.entries(byRef).filter(([ref]) => keep.has(ref)))
  const { reloads, findings, notes, claims } = store.getState()
  store.setState({
    board,
    reloads: held(reloads, refs),
    findings: held(findings, refs),
    notes: held(notes, pageRefs),
    claims: held(claims, refs),
  })
}

/** Replaces one page's notes. */
export function receiveNotes(
  store: LiveStore,
  page: string,
  notes: readonly BoardNote[],
): void {
  store.setState({ notes: { ...store.getState().notes, [page]: notes } })
}

/** Replaces the listening sessions. */
export function receiveListeners(
  store: LiveStore,
  listeners: readonly Listener[],
): void {
  store.setState({ listeners })
}

/** Replaces the undo and redo counts. */
export function receiveHistory(
  store: LiveStore,
  history: { undo: number; redo: number },
): void {
  store.setState({ history })
}

/** Replaces the live claims, keyed by the frame each holds. */
export function receiveClaims(
  store: LiveStore,
  claims: readonly Claim[],
): void {
  store.setState({
    claims: Object.fromEntries(claims.map((claim) => [claim.frame, claim])),
  })
}

/** Merges one theme's thumbnail stamps, a `null` deleting the frame's. */
export function receiveThumbnails(
  store: LiveStore,
  theme: Theme,
  stamps: Readonly<Record<string, string | null>>,
): void {
  const { thumbnails } = store.getState()
  const next = { ...thumbnails[theme] }
  for (const [ref, stamp] of Object.entries(stamps)) {
    if (stamp === null) delete next[ref]
    else next[ref] = stamp
  }
  store.setState({ thumbnails: { ...thumbnails, [theme]: next } })
}

/**
 * Marks the socket closed. Writing, the listeners, the notes, the claims, and
 * the history counts all wait on the next hello, which sends them afresh, so a
 * page whose notes went while the socket was down shows none rather than
 * stale ones, and Undo never offers a step a restarted server forgot. The
 * thumbnails go too, since a restarted server empties the ones it served.
 */
export function receiveDisconnect(store: LiveStore): void {
  store.setState({
    connected: false,
    canWrite: false,
    accessKnown: false,
    notes: {},
    listeners: [],
    history: { undo: 0, redo: 0 },
    claims: {},
    thumbnails: { light: {}, dark: {} },
  })
}

/** Replaces the findings of each frame named, an empty list clearing one. */
export function receiveFindings(
  store: LiveStore,
  findings: Readonly<Record<string, readonly Finding[]>>,
): void {
  store.setState({ findings: { ...store.getState().findings, ...findings } })
}

/** Records the server's answer on whether this tab may write. */
export function receiveAccess(store: LiveStore, write: boolean): void {
  store.setState({ canWrite: write, accessKnown: true })
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
