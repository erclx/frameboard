import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { LiveStore } from '@/client/live/store'
import { writeBoard } from '@/client/live/write'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import { type Box, sameBox } from './box'

/**
 * How long a landed box waits for a board carrying it, after which it drops
 * and the frame draws whatever the board holds, an agent's later move included.
 */
const LANDED_MS = 2000

interface Pending {
  box: Box
}

interface PendingState {
  byRef: Readonly<Record<string, Pending>>
}

/**
 * Boxes a hand edit sent and the board has not carried back yet. A frame
 * draws its pending box over its stored one, so a released move holds its
 * place until the server's next board arrives rather than flashing back.
 */
const pendingStore = createStore<PendingState>()(() => ({ byRef: {} }))

/** The box a frame draws at while a write of it is out. */
export function usePendingBox(ref: string): Box | undefined {
  return useStore(pendingStore, (state) => state.byRef[ref]?.box)
}

/** The frames as drawn, each pending box over its stored one, rereading on every change when used as a hook. */
export function usePendingFrames(
  frames: readonly FrameRecord[],
): FrameRecord[] {
  const byRef = useStore(pendingStore, (state) => state.byRef)
  return drawn(frames, byRef)
}

/** The frames as drawn right now, for a gesture handler. */
export function withPending(frames: readonly FrameRecord[]): FrameRecord[] {
  return drawn(frames, pendingStore.getState().byRef)
}

function drawn(
  frames: readonly FrameRecord[],
  byRef: PendingState['byRef'],
): FrameRecord[] {
  return frames.map((frame) => {
    const pending = byRef[frame.ref]
    return pending ? { ...frame, box: pending.box } : frame
  })
}

/**
 * Draws boxes a run of edits has not sent yet, such as nudges waiting for
 * the keys to rest. The `writeBoxes` that follows owns them from then on.
 */
export function holdBoxes(boxes: Readonly<Record<string, Box>>): void {
  setPending(Object.keys(boxes), (ref) => {
    const box = boxes[ref]
    return box && { box }
  })
}

/**
 * Sends a hand edit's boxes for one page, keyed by frame ref, with the boxes
 * the edit started from. The new boxes draw at once, and a refusal drops
 * them so the board shows the stored ones. Resolves whether the write landed.
 */
export async function writeBoxes(
  page: string,
  boxes: Readonly<Record<string, Box>>,
  expected: Readonly<Record<string, Box>>,
  send: typeof fetch = fetch,
): Promise<boolean> {
  const refs = Object.keys(boxes)
  if (refs.length === 0) return true
  const sent = new Map(
    Object.entries(boxes).map(([ref, box]) => [ref, { box }]),
  )
  setPending(refs, (ref) => sent.get(ref))
  // A later write of the same frame owns its own entry, so only this one's drop.
  const drop = () => {
    const { byRef } = pendingStore.getState()
    setPending(
      refs.filter((ref) => byRef[ref] === sent.get(ref)),
      () => undefined,
    )
  }
  try {
    await writeBoard(
      '/api/frames/boxes',
      { page, boxes: byName(boxes), expected: byName(expected) },
      'POST',
      send,
    )
  } catch {
    drop()
    return false
  }
  setTimeout(drop, LANDED_MS)
  return true
}

/**
 * Drops the pending boxes of the frames named, which an undo or redo just
 * rewrote, so a frame draws the box the server holds rather than the one
 * its hand edit left pending.
 */
export function dropPending(refs: readonly string[]): void {
  setPending(refs, () => undefined)
}

/** Drops each pending box a board the server sends already carries, returning the function that stops. */
export function followPending(live: LiveStore): () => void {
  return live.subscribe((state, previous) => {
    if (state.board && state.board !== previous.board) settle(state.board)
  })
}

function settle(board: ListResult): void {
  const stored = new Map(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.map((frame) => [frame.ref, frame.box] as const),
      ),
    ),
  )
  const { byRef } = pendingStore.getState()
  const kept = Object.entries(byRef).filter(([ref, pending]) => {
    const box = stored.get(ref)
    return box !== undefined && !sameBox(box, pending.box)
  })
  if (kept.length === Object.keys(byRef).length) return
  pendingStore.setState({ byRef: Object.fromEntries(kept) })
}

function setPending(
  refs: readonly string[],
  next: (ref: string) => Pending | undefined,
): void {
  if (refs.length === 0) return
  const byRef = { ...pendingStore.getState().byRef }
  for (const ref of refs) {
    const pending = next(ref)
    if (pending) byRef[ref] = pending
    else delete byRef[ref]
  }
  pendingStore.setState({ byRef })
}

/** The route takes frame names on one page, and the board keys boxes by ref. */
function byName(boxes: Readonly<Record<string, Box>>): Record<string, Box> {
  return Object.fromEntries(
    Object.entries(boxes).map(([ref, box]) => [
      ref.slice(ref.lastIndexOf('/') + 1),
      box,
    ]),
  )
}
