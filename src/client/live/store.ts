import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { isEqual } from '@/shared/board-sync/patch'
import {
  holdsRef,
  renameOnBoard,
  takesRename,
} from '@/shared/board-sync/rename'
import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type {
  ListResult,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'
import type { BoardNote, Listener } from '@/shared/records/notes'
import type { Theme } from '@/shared/theme'

export interface LiveState {
  /** The last board the server sent, null until the first arrives. */
  board: ListResult | null
  /** Per-frame reload counters by ref, absent meaning zero. */
  reloads: Readonly<Record<string, number>>
  /**
   * How many of each frame's reloads its own iframe took without loading, by
   * ref, absent meaning zero, since its live page already showed the bytes.
   * Everything else reading the frame's file still follows `reloads`.
   */
  kept: Readonly<Record<string, number>>
  connected: boolean
  /**
   * The port frames load from, null until the socket's first hello settles,
   * and kept across a dropped socket, since a restarted server's hello
   * replaces it.
   */
  framePort: number | null
  /** The hostname frames load from on that port, null and replaced with it. */
  frameHost: string | null
  /** Whether this tab may write, false until the server's `access` answer and again whenever the socket drops. */
  canWrite: boolean
  /** Whether a note this tab sends can start a session, cleared with `canWrite`. */
  dispatch: boolean
  /** Whether this reading tab may ask for edit access, cleared with `canWrite`. */
  editButton: boolean
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
  /**
   * What each project or page this session renamed was first called, by its
   * name now, which `identityOf` reads so a rename keeps what the board shows.
   */
  aliases: Readonly<Record<string, string>>
}

export type LiveStore = StoreApi<LiveState>

export function createLiveStore(): LiveStore {
  return createStore<LiveState>()(() => ({
    board: null,
    reloads: {},
    kept: {},
    connected: false,
    framePort: null,
    frameHost: null,
    canWrite: false,
    dispatch: false,
    editButton: false,
    accessKnown: false,
    focus: null,
    findings: {},
    notes: {},
    listeners: [],
    history: { undo: 0, redo: 0 },
    claims: {},
    thumbnails: { light: {}, dark: {} },
    aliases: {},
  }))
}

/**
 * The ref a project, page, or frame had before this session renamed it or
 * what holds it, the same through every rename and its undo, so a key built
 * on it keeps a rendered page or frame mounted.
 */
export function identityOf(
  aliases: Readonly<Record<string, string>>,
  ref: string,
): string {
  const parts = ref.split('/')
  for (let held = parts.length; held > 0; held--) {
    const alias = aliases[parts.slice(0, held).join('/')]
    if (alias !== undefined) return [alias, ...parts.slice(held)].join('/')
  }
  return ref
}

/**
 * Renames on the board in hand ahead of the snapshot, moving every keyed store,
 * and leaving a board that already carries the rename alone.
 */
export function receiveRename(
  store: LiveStore,
  before: string,
  after: string,
): void {
  const state = store.getState()
  const { board } = state
  if (!board || !takesRename(board, before, after)) return
  const moveKeys = <T>(byRef: Readonly<Record<string, T>>) =>
    movedKeys(byRef, before, after)
  // No alias for a frame, which would keep its iframe on a dead path.
  const isFrame = before.split('/').length === 3
  const aliases = isFrame
    ? state.aliases
    : {
        ...moveKeys(state.aliases),
        [after]: identityOf(state.aliases, before),
      }
  const renamed = renameOnBoard(board, before, after)
  store.setState({
    board: renamed,
    reloads: moveKeys(state.reloads),
    kept: moveKeys(state.kept),
    findings: moveKeys(state.findings),
    notes: moveKeys(state.notes),
    claims: moveKeys(state.claims),
    thumbnails: {
      light: moveKeys(state.thumbnails.light),
      dark: moveKeys(state.thumbnails.dark),
    },
    aliases: liveAliases(aliases, renamed),
  })
}

/**
 * Where a rename of the project or page `before` to `after` moves `ref`,
 * being the ref itself and anything under `before/`.
 */
export function movedRef(ref: string, before: string, after: string): string {
  return isUnder(ref, before) ? `${after}${ref.slice(before.length)}` : ref
}

/**
 * `byRef` with its keys moved across a rename. A key already under `after`
 * names what the board stopped holding before the rename, so it is dropped
 * rather than left on the frames that move there.
 */
export function movedKeys<T>(
  byRef: Readonly<Record<string, T>>,
  before: string,
  after: string,
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(byRef)
      .filter(([ref]) => !isUnder(ref, after))
      .map(([ref, value]) => [movedRef(ref, before, after), value]),
  )
}

function isUnder(ref: string, prefix: string): boolean {
  return ref === prefix || ref.startsWith(`${prefix}/`)
}

/**
 * The entries of `byRef` on a project or page, or on what it holds. Read it
 * through `useShallow`, since a call can answer a new object each time.
 */
export function under<T>(
  byRef: Readonly<Record<string, T>>,
  ref: string,
): Readonly<Record<string, T>> {
  return keepKeys(byRef, (key) => isUnder(key, ref))
}

/**
 * The aliases still naming an identity nothing else holds. One whose first
 * name the board now holds again, such as a page added under a name renamed
 * away, is dropped, so the two never share a canvas or a frame.
 */
function liveAliases(
  aliases: Readonly<Record<string, string>>,
  board: ListResult,
): Readonly<Record<string, string>> {
  return keepKeys(
    aliases,
    (ref, first) => ref !== first && !holdsRef(board, first),
  )
}

/** `byRef` without the keys `keep` refuses, the same object when it refuses none. */
function keepKeys<T>(
  byRef: Readonly<Record<string, T>>,
  keep: (ref: string, value: T) => boolean,
): Readonly<Record<string, T>> {
  const entries = Object.entries(byRef)
  const left = entries.filter(([ref, value]) => keep(ref, value))
  return left.length === entries.length ? byRef : Object.fromEntries(left)
}

/**
 * The page ref a rename moved `ref` to between two states, or null when the
 * page was not renamed. A route following it in the same update as the board
 * never shows the old name missing.
 */
export function renamedRef(
  previous: LiveState,
  next: LiveState,
  ref: string,
): string | null {
  if (next.aliases === previous.aliases || !previous.board || !next.board) {
    return null
  }
  if (!holdsRef(previous.board, ref) || holdsRef(next.board, ref)) return null
  const identity = identityOf(previous.aliases, ref)
  const page = next.board.projects
    .flatMap((project) => project.pages)
    .find((candidate) => identityOf(next.aliases, candidate.ref) === identity)
  return page?.ref ?? null
}

/**
 * Replaces the board, keeping each record equal to the one held and dropping
 * keys of frames and pages it no longer holds. The board itself is always new,
 * since its subscribers read a new one as a board having arrived.
 */
export function receiveBoard(store: LiveStore, board: ListResult): void {
  const state = store.getState()
  const pages = board.projects.flatMap((project) => project.pages)
  const refs = new Set(
    pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
  )
  const pageRefs = new Set(pages.map((page) => page.ref))
  const onFrame = (ref: string) => refs.has(ref)
  store.setState({
    board: {
      ...board,
      projects: keepList(
        state.board?.projects ?? [],
        board.projects,
        (project) => project.name,
        keepProject,
      ),
    },
    reloads: keepKeys(state.reloads, onFrame),
    kept: keepKeys(state.kept, onFrame),
    findings: keepKeys(state.findings, onFrame),
    notes: keepKeys(state.notes, (ref) => pageRefs.has(ref)),
    // A reservation names a frame the board does not list until it lands.
    claims: keepKeys(
      state.claims,
      (ref, claim) => refs.has(ref) || claim.box !== undefined,
    ),
    aliases: liveAliases(state.aliases, board),
  })
}

function keepProject(held: ProjectRecord, next: ProjectRecord): ProjectRecord {
  const pages = keepList(held.pages, next.pages, (page) => page.ref, keepPage)
  return keepEqual(held, { ...next, pages })
}

function keepPage(held: PageRecord, next: PageRecord): PageRecord {
  const frames = keepList(
    held.frames,
    next.frames,
    (frame) => frame.ref,
    keepEqual,
  )
  return keepEqual(held, { ...next, frames })
}

/**
 * `next` with `keep` run on each record `held` also names, paired by name so
 * one added or removed ahead moves no pair. Returns `held` when every record
 * stayed in place.
 */
function keepList<T>(
  held: T[],
  next: T[],
  nameOf: (record: T) => string,
  keep: (held: T, next: T) => T,
): T[] {
  const byName = new Map(held.map((record) => [nameOf(record), record]))
  const list = next.map((record) => {
    const match = byName.get(nameOf(record))
    return match === undefined ? record : keep(match, record)
  })
  const unchanged =
    list.length === held.length &&
    list.every((record, at) => record === held[at])
  return unchanged ? held : list
}

function keepEqual<T>(held: T, next: T): T {
  return isEqual(held, next) ? held : next
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
 * Marks the socket closed, clearing what the next hello resends, so Undo never
 * offers a step a restarted server forgot.
 */
export function receiveDisconnect(store: LiveStore): void {
  store.setState({
    connected: false,
    canWrite: false,
    dispatch: false,
    editButton: false,
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

/** Holds the port and host frames load from together, so a moved port loads each frame once. */
export function receiveFrames(
  store: LiveStore,
  port: number,
  host: string,
): void {
  store.setState({ framePort: port, frameHost: host })
}

/** Records the server's answer on whether this tab may write, whether its notes can start a session, and whether it may ask to edit. */
export function receiveAccess(
  store: LiveStore,
  write: boolean,
  dispatch = false,
  editButton = false,
): void {
  store.setState({ canWrite: write, dispatch, editButton, accessKnown: true })
}

/**
 * Bumps each frame's counter, which reloads its iframe alone. A ref in
 * `kept` bumps its kept counter too, so its own iframe stays as it is while
 * its linked widths and every read of its file still reload.
 */
export function receiveReload(
  store: LiveStore,
  refs: readonly string[],
  kept: readonly string[] = [],
): void {
  const state = store.getState()
  const reloads = { ...state.reloads }
  for (const ref of refs) reloads[ref] = (reloads[ref] ?? 0) + 1
  const keptNow = { ...state.kept }
  for (const ref of kept) keptNow[ref] = (keptNow[ref] ?? 0) + 1
  store.setState({ reloads, kept: keptNow })
}

/** The one store the app's socket writes and its screens read. */
export const liveStore = createLiveStore()

export function useLive<T>(selector: (state: LiveState) => T): T {
  return useStore(liveStore, selector)
}
