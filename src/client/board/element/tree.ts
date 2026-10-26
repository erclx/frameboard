import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { liveStore, useLive } from '@/client/live/store'
import type { ElementTree } from '@/shared/records/elements'

/** One frame's tree as the server last answered it, or why it would not. */
export type TreeEntry =
  | { status: 'loading' }
  | { status: 'ready'; tree: ElementTree }
  | { status: 'refused'; message: string }

interface TreesState {
  /** By frame ref, with the reload count it was fetched at. */
  byRef: Readonly<Record<string, TreeEntry & { version: number }>>
}

export interface Trees {
  store: StoreApi<TreesState>
  /** Fetches a frame's tree unless one fetched at this reload count is held or on its way. */
  request: (ref: string, version: number) => void
  /** Requests a frame's tree and resolves it once it is held, or null when the server refused it. */
  read: (ref: string, version: number) => Promise<ElementTree | null>
  /**
   * Waits for the tree at this reload count and fetches it once more when it
   * shows other bytes than `hash`, which the board just wrote, since the
   * reload's fetch can read the file before the write lands.
   */
  catchUp: (ref: string, hash: string, version: number) => Promise<void>
}

/**
 * Each frame's element tree from `GET /api/frames/elements`, fetched once
 * per reload of the frame, so the rows and the keys read the indices `edit`
 * addresses whether or not the frame's iframe is live. An answer for a reload
 * count older than the one last asked for is dropped.
 */
export function createTrees(
  load: (ref: string) => Promise<ElementTree>,
): Trees {
  const store = createStore<TreesState>()(() => ({ byRef: {} }))
  const put = (ref: string, entry: TreeEntry, version: number) => {
    const held = store.getState().byRef[ref]
    if (held && held.version > version) return
    store.setState((state) => ({
      byRef: { ...state.byRef, [ref]: { ...entry, version } },
    }))
  }
  const request = (ref: string, version: number) => {
    const held = store.getState().byRef[ref]
    if (held && held.version >= version) return
    fetchAt(ref, version)
  }
  const fetchAt = (ref: string, version: number) => {
    put(ref, { status: 'loading' }, version)
    load(ref).then(
      (tree) => put(ref, { status: 'ready', tree }, version),
      (error: unknown) =>
        put(
          ref,
          {
            status: 'refused',
            message: error instanceof Error ? error.message : String(error),
          },
          version,
        ),
    )
  }
  const read = (ref: string, version: number) => {
    request(ref, version)
    return new Promise<ElementTree | null>((resolve) => {
      const settled = () => {
        const entry = store.getState().byRef[ref]
        if (!entry || entry.status === 'loading') return false
        resolve(entry.status === 'ready' ? entry.tree : null)
        return true
      }
      if (settled()) return
      const stop = store.subscribe(() => {
        if (settled()) stop()
      })
    })
  }
  const catchUp = async (ref: string, hash: string, version: number) => {
    const tree = await read(ref, version)
    const held = store.getState().byRef[ref]
    if (!tree || tree.hash === hash || !held || held.version > version) return
    fetchAt(ref, version)
    await read(ref, version)
  }
  return { store, request, read, catchUp }
}

/** Reads a tree from the board's server, throwing the refusal's message. */
export async function fetchTree(
  ref: string,
  send: typeof fetch = fetch,
): Promise<ElementTree> {
  const response = await send(
    `/api/frames/elements?ref=${encodeURIComponent(ref)}`,
  )
  const envelope = (await response.json().catch(() => null)) as
    | { ok: true; data: ElementTree }
    | { ok: false; error: { message: string } }
    | null
  if (!envelope) throw new Error(`The board answered ${response.status}.`)
  if (!envelope.ok) throw new Error(envelope.error.message)
  return envelope.data
}

/** The board's one tree cache. */
export const trees = createTrees((ref) => fetchTree(ref))

/** A frame's held tree when it is ready, for the keys that walk it. */
export function treeOf(ref: string): ElementTree | null {
  const entry = trees.store.getState().byRef[ref]
  return entry?.status === 'ready' ? entry.tree : null
}

/** Asks for a frame's tree once per reload of it, and reads what is held. */
export function useElementTree(ref: string | null): TreeEntry | null {
  const version = useLive((state) => (ref ? (state.reloads[ref] ?? 0) : 0))
  useEffect(() => {
    if (ref) trees.request(ref, version)
  }, [ref, version])
  return useStore(trees.store, (state) =>
    ref ? (state.byRef[ref] ?? null) : null,
  )
}

/** Asks for a frame's tree at its current reload count, outside React. */
export function requestTree(ref: string): void {
  trees.request(ref, liveStore.getState().reloads[ref] ?? 0)
}

/** Brings a frame's tree up to bytes the board just wrote, at its current reload count. */
export function catchUpTree(ref: string, hash: string): Promise<void> {
  return trees.catchUp(ref, hash, liveStore.getState().reloads[ref] ?? 0)
}

/** Reads a frame's tree at its current reload count, waiting for it when it has not arrived. */
export function readTree(ref: string): Promise<ElementTree | null> {
  return trees.read(ref, liveStore.getState().reloads[ref] ?? 0)
}
