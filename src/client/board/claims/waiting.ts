import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { type LiveStore, liveStore } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import { claimCovers } from '@/shared/records/claims'

/** What a waiting edit is, as its card reads it in `Your <edit> will wait`. */
export type EditLabel =
  | 'move'
  | 'resize'
  | 'edit'
  | 'rename'
  | 'delete'
  | 'cut'
  | 'undo'
  | 'redo'

/** The session holding a frame an edit waits on, as the card names it. */
export interface Holder {
  frame: string
  tag: string
  claimedAt: string
}

/** One hand edit held back while another session holds a frame it writes. */
export interface WaitingEdit {
  id: number
  label: EditLabel
  holders: readonly Holder[]
}

/** A waiting edit that will never be sent, replaced by a newer one or cancelled by Esc, a page change, or Play. */
export class WaitDropped extends Error {
  constructor(readonly reason: 'replaced' | 'cancelled') {
    super(`The waiting edit was ${reason}.`)
    this.name = 'WaitDropped'
  }
}

export interface WaitOptions {
  live?: LiveStore
  /**
   * A kind of edit whose newer one replaces an older one waiting on any of
   * the same refs, as a box edit does, since a box is the whole state.
   */
  replace?: string
}

/**
 * How long a refused edit waits for the socket to show the claim the
 * server refused it on, before it tries again. The refusal can land ahead
 * of the claims message, and an edit waiting for a drop the board never saw
 * would otherwise sit until the claim expired.
 */
export const REFUSAL_GRACE_MS = 2000

/** How often a waiting edit rereads the clock, for an expiry or the grace. */
const TICK_MS = 1000

interface Waiter {
  edit: WaitingEdit
  refs: readonly string[]
  replace: string | undefined
  reject: (error: WaitDropped) => void
  stop: () => void
}

const waitingStore = createStore<{ edits: readonly WaitingEdit[] }>()(() => ({
  edits: [],
}))
const waiters = new Set<Waiter>()
let nextId = 1

/** The edits waiting now, oldest first, for the cards. */
export function useWaiting(): readonly WaitingEdit[] {
  return useStore(waitingStore, (state) => state.edits)
}

/**
 * Resolves at once when nobody holds a frame `refs` reaches, else records a
 * waiting edit naming each holder and resolves once the board's claims drop
 * every one. A ref is a frame, page, or project ref. Rejects with
 * `WaitDropped` when a newer edit replaces it or the wait is cancelled.
 */
export function afterClaims(
  refs: readonly string[],
  label: EditLabel,
  options: WaitOptions = {},
): Promise<void> {
  return waitIfHeld(refs, label, options) ?? Promise.resolve()
}

/** `afterClaims`, answering null rather than a resolved promise when nothing is held, so a send can start in the same turn. */
function waitIfHeld(
  refs: readonly string[],
  label: EditLabel,
  { live = liveStore, replace }: WaitOptions,
): Promise<void> | null {
  if (replace) dropReplaced(refs, replace)
  const holding = () =>
    Object.values(live.getState().claims).filter((claim) =>
      refs.some((ref) => claimCovers(ref, claim.frame)),
    )
  const held = holding()
  if (held.length === 0) return null
  return wait({
    label,
    refs,
    replace,
    live,
    holders: held.map(({ frame, tag, claimedAt }) => ({
      frame,
      tag,
      claimedAt,
    })),
    ready: () => live.getState().connected && holding().length === 0,
  })
}

/**
 * Waits after the server refused an edit as `frame-claimed`, on the frame
 * its details name, until the board shows that claim drop, it expires, or
 * the board never shows it within `REFUSAL_GRACE_MS`.
 */
export function afterRefusal(
  error: BoardWriteError,
  label: EditLabel,
  { live = liveStore, replace }: WaitOptions = {},
): Promise<void> {
  const { frame, tag, claimedAt, expiresAt } = error.details
  if (typeof frame !== 'string') return Promise.reject(error)
  const holder: Holder = {
    frame,
    tag: typeof tag === 'string' ? tag : frame,
    claimedAt:
      typeof claimedAt === 'string' ? claimedAt : new Date().toISOString(),
  }
  const lapses =
    typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN
  const started = Date.now()
  let seen = false
  if (replace) dropReplaced([frame], replace)
  return wait({
    label,
    refs: [frame],
    replace,
    live,
    holders: [holder],
    ready: () => {
      const { claims, connected } = live.getState()
      if (frame in claims) seen = true
      if (!connected || frame in claims) return false
      const now = Date.now()
      return seen || now >= lapses || now - started >= REFUSAL_GRACE_MS
    },
  })
}

/**
 * Sends `send` once nobody holds a frame `refs` reaches, and again after
 * each `frame-claimed` refusal once that claim drops, so a claim taken
 * between the board's check and the server's write waits like any other.
 */
export async function whenFree<T>(
  refs: readonly string[],
  label: EditLabel,
  send: () => Promise<T>,
  options: WaitOptions = {},
): Promise<T> {
  const held = waitIfHeld(refs, label, options)
  if (held) await held
  for (;;) {
    try {
      return await send()
    } catch (error) {
      if (!(error instanceof BoardWriteError) || error.code !== 'frame-claimed')
        throw error
      await afterRefusal(error, label, options)
    }
  }
}

/** Cancels every waiting edit, for Esc, a page change, and Play. */
export function dropWaiting(): void {
  for (const waiter of [...waiters])
    finish(waiter, new WaitDropped('cancelled'))
}

/** Whether an edit is waiting now. */
export function isWaiting(): boolean {
  return waiters.size > 0
}

function wait({
  label,
  refs,
  replace,
  live,
  holders,
  ready,
}: {
  label: EditLabel
  refs: readonly string[]
  replace: string | undefined
  live: LiveStore
  holders: readonly Holder[]
  ready: () => boolean
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const edit: WaitingEdit = { id: nextId++, label, holders }
    const check = () => {
      if (ready()) {
        finish(waiter)
        resolve()
      }
    }
    const unsubscribe = live.subscribe(check)
    const timer = setInterval(check, TICK_MS)
    const waiter: Waiter = {
      edit,
      refs,
      replace,
      reject,
      stop: () => {
        unsubscribe()
        clearInterval(timer)
      },
    }
    waiters.add(waiter)
    waitingStore.setState((state) => ({ edits: [...state.edits, edit] }))
    check()
  })
}

function dropReplaced(refs: readonly string[], replace: string): void {
  for (const waiter of [...waiters]) {
    if (
      waiter.replace === replace &&
      waiter.refs.some((ref) => refs.includes(ref))
    ) {
      finish(waiter, new WaitDropped('replaced'))
    }
  }
}

function finish(waiter: Waiter, dropped?: WaitDropped): void {
  if (!waiters.delete(waiter)) return
  waiter.stop()
  waitingStore.setState((state) => ({
    edits: state.edits.filter((edit) => edit !== waiter.edit),
  }))
  if (dropped) waiter.reject(dropped)
}
