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
  /** Whether a note this tab sends can start a session, cleared with `canWrite`. */
  dispatch: boolean
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
    connected: false,
    canWrite: false,
    dispatch: false,
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
 * Renames a project or page on the board in hand, ahead of the snapshot
 * that will carry it, moving every count, finding, claim, note, and
 * thumbnail to the new refs and recording the alias `identityOf` reads. A
 * board that no longer holds `before`, or already holds `after`, carries the
 * rename already and is left alone.
 */
export function receiveRename(
  store: LiveStore,
  before: string,
  after: string,
): void {
  const state = store.getState()
  const { board } = state
  if (!board || !holdsRef(board, before) || holdsRef(board, after)) return
  const move = (ref: string) =>
    ref === before || ref.startsWith(`${before}/`)
      ? `${after}${ref.slice(before.length)}`
      : ref
  const moveKeys = <T>(byRef: Readonly<Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(byRef).map(([ref, value]) => [move(ref), value]),
    )
  const aliases = moveKeys(state.aliases)
  aliases[after] = identityOf(state.aliases, before)
  const renamed = renameOnBoard(board, before, after)
  store.setState({
    board: renamed,
    reloads: moveKeys(state.reloads),
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
 * The aliases still naming an identity nothing else holds. One whose first
 * name the board now holds again, such as a page added under a name renamed
 * away, is dropped, so the two never share a canvas or a frame.
 */
function liveAliases(
  aliases: Readonly<Record<string, string>>,
  board: ListResult,
): Readonly<Record<string, string>> {
  const kept = Object.entries(aliases).filter(
    ([ref, first]) => ref !== first && !holdsRef(board, first),
  )
  return kept.length === Object.keys(aliases).length
    ? aliases
    : Object.fromEntries(kept)
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

function holdsRef(board: ListResult, ref: string): boolean {
  return board.projects.some(
    (project) =>
      project.name === ref || project.pages.some((page) => page.ref === ref),
  )
}

/** The board with one project or page renamed, its folder path and everything under it following. */
function renameOnBoard(
  board: ListResult,
  before: string,
  after: string,
): ListResult {
  const [project = '', page] = before.split('/')
  const name = after.split('/').at(-1) ?? after
  const repath = (from: string, to: string) => (path: string) =>
    path === from || path.startsWith(`${from}/`)
      ? `${to}${path.slice(from.length)}`
      : path
  return {
    ...board,
    projects: board.projects.map((held) => {
      if (held.name !== project) return held
      if (page === undefined) {
        const path = repath(held.path, siblingPath(held.path, name))
        return {
          ...held,
          name,
          path: path(held.path),
          pages: held.pages.map((each) => ({
            ...each,
            ref: `${name}/${each.name}`,
            project: name,
            path: path(each.path),
            frames: each.frames.map((frame) => ({
              ...frame,
              ref: `${name}/${each.name}/${frame.name}`,
              project: name,
              path: path(frame.path),
            })),
          })),
        }
      }
      return {
        ...held,
        pages: held.pages.map((each) => {
          if (each.name !== page) return each
          const path = repath(each.path, siblingPath(each.path, name))
          return {
            ...each,
            ref: after,
            name,
            path: path(each.path),
            frames: each.frames.map((frame) => ({
              ...frame,
              ref: `${after}/${frame.name}`,
              page: name,
              path: path(frame.path),
            })),
          }
        }),
      }
    }),
  }
}

/** The folder path beside `path` named `name`. */
function siblingPath(path: string, name: string): string {
  return `${path.slice(0, path.lastIndexOf('/') + 1)}${name}`
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
  const { reloads, findings, notes, claims, aliases } = store.getState()
  store.setState({
    board,
    reloads: held(reloads, refs),
    findings: held(findings, refs),
    notes: held(notes, pageRefs),
    claims: held(claims, refs),
    aliases: liveAliases(aliases, board),
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
    dispatch: false,
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

/** Records the server's answer on whether this tab may write, and whether its notes can start a session. */
export function receiveAccess(
  store: LiveStore,
  write: boolean,
  dispatch = false,
): void {
  store.setState({ canWrite: write, dispatch, accessKnown: true })
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
