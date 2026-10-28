import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { LiveStore } from '@/client/live/store'
import { writeBoard } from '@/client/live/write'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import { whenFree } from '../claims/waiting'
import {
  endPreview,
  previewedBox,
  previewFrames,
  previewsNow,
  usePreview,
  usePreviewedFrames,
} from '../preview/store'
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

/**
 * The frames at the boxes a write starts from right now, each pending box
 * over its stored one, for a gesture or an action. A width preview never
 * reaches it, so no write can start from a previewed width.
 */
export function withPending(frames: readonly FrameRecord[]): FrameRecord[] {
  return drawn(frames, pendingStore.getState().byRef)
}

/**
 * The box a frame draws at, its pending box over its stored one at its
 * preview's width. For drawing alone, since a write starting here would
 * persist the preview.
 */
export function useDrawnBox(frame: FrameRecord): Box {
  const box = usePendingBox(frame.ref) ?? frame.box
  return previewedBox(frame, box, usePreview(frame.ref))
}

/** The frames as drawn, each at its pending box and its preview's width, rereading on every change. */
export function useDrawnFrames(frames: readonly FrameRecord[]): FrameRecord[] {
  return usePreviewedFrames(usePendingFrames(frames))
}

/** The frames as drawn right now, for hit-testing a press. Never a write's base. */
export function withDrawn(frames: readonly FrameRecord[]): FrameRecord[] {
  return previewFrames(withPending(frames), previewsNow())
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
 * the keys to rest, ending the preview of each frame named. The `writeBoxes`
 * that follows owns them from then on.
 */
export function holdBoxes(boxes: Readonly<Record<string, Box>>): void {
  endPreview(Object.keys(boxes))
  setPending(Object.keys(boxes), (ref) => {
    const box = boxes[ref]
    return box && { box }
  })
}

/** A waiting box edit, being every box it will send. */
interface WaitingBoxes {
  boxes: Readonly<Record<string, Box>>
  sections?: SectionBoxes
}

/**
 * The box each frame's waiting edit started from, by ref, and that edit. A
 * gesture on a waiting frame starts from its pending box, which the file does
 * not hold, so the edit replacing the waiting one sends this box as
 * `expected`, and carries the waiting edit's other frames along with it.
 */
const waitingFrom = new Map<string, { box: Box; owner: WaitingBoxes }>()

/** A section's box a hand edit sends beside its frames, by section name, with the box it started from. */
export interface SectionBoxes {
  boxes: Readonly<Record<string, Box>>
  expected: Readonly<Record<string, Box>>
}

/**
 * Sends a hand edit's boxes for one page, keyed by frame ref, with the boxes
 * the edit started from. A section move or resize sends its box in
 * `sections`, so the box and the frames it carries land as one step. The
 * new boxes draw at once and hold while another session holds a frame, the
 * edit waiting until the claim drops and a newer edit of the same frame
 * replacing it, the newer one taking up the older's other frames and section
 * boxes. A refusal or a cancelled wait drops them so the board shows the
 * stored ones. Resolves whether the write landed.
 */
export async function writeBoxes(
  page: string,
  asked: Readonly<Record<string, Box>>,
  expected: Readonly<Record<string, Box>>,
  send: typeof fetch = fetch,
  sections?: SectionBoxes,
): Promise<boolean> {
  if (Object.keys(asked).length === 0 && !sections) return true
  // An edit of a frame's box acts on the box itself, so it ends any preview
  // rather than leave the frame drawn at a width it no longer starts from.
  endPreview(Object.keys(asked))
  const boxes: Record<string, Box> = { ...asked }
  const started: Record<string, Box> = { ...expected }
  const sectionBoxes: Record<string, Box> = { ...sections?.boxes }
  const sectionsFrom: Record<string, Box> = { ...sections?.expected }
  for (const ref of Object.keys(asked)) {
    const waiting = waitingFrom.get(ref)
    if (!waiting) continue
    // The waiting edit's section moves with the frames it carried, so its box
    // goes with them rather than stay behind once they land.
    for (const [name, box] of Object.entries(
      waiting.owner.sections?.boxes ?? {},
    )) {
      if (name in sectionBoxes) continue
      sectionBoxes[name] = box
      const from = waiting.owner.sections?.expected[name]
      if (from) sectionsFrom[name] = from
    }
    for (const [other, box] of Object.entries(waiting.owner.boxes)) {
      if (other in boxes) continue
      boxes[other] = box
      const from = waitingFrom.get(other)?.box
      if (from) started[other] = from
    }
  }
  for (const ref of Object.keys(boxes)) {
    const from = waitingFrom.get(ref)?.box
    if (from) started[ref] = from
  }
  const refs = Object.keys(boxes)
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
  const carried =
    Object.keys(sectionBoxes).length > 0
      ? { boxes: sectionBoxes, expected: sectionsFrom }
      : undefined
  const owner: WaitingBoxes = { boxes, sections: carried }
  const hold = () => {
    for (const ref of refs) {
      const box = started[ref]
      if (box) waitingFrom.set(ref, { box, owner })
    }
  }
  const release = () => {
    for (const ref of refs) {
      if (waitingFrom.get(ref)?.owner === owner) waitingFrom.delete(ref)
    }
  }
  hold()
  try {
    await whenFree(
      refs,
      labelOf(boxes, started),
      async () => {
        release()
        try {
          return await writeBoard(
            '/api/frames/boxes',
            {
              page,
              boxes: byName(boxes),
              expected: byName(started),
              sections: carried?.boxes,
              expectedSections: carried?.expected,
            },
            'POST',
            send,
          )
        } catch (error) {
          // A claim refusal waits again, and an edit replacing it starts from here too.
          hold()
          throw error
        }
      },
      { replace: 'boxes' },
    )
  } catch {
    release()
    drop()
    return false
  }
  setTimeout(drop, LANDED_MS)
  return true
}

/** A box edit reads as a move unless a frame's size changed. */
function labelOf(
  boxes: Readonly<Record<string, Box>>,
  started: Readonly<Record<string, Box>>,
): 'move' | 'resize' {
  const resized = Object.entries(boxes).some(([ref, box]) => {
    const from = started[ref]
    return from && (from.width !== box.width || from.height !== box.height)
  })
  return resized ? 'resize' : 'move'
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
