import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { LiveStore } from '@/client/live/store'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import type { Box } from '../geometry/box'

/** A frame drawn at another width than its stored one, with its content's height there once measured. */
export interface Preview {
  width: number
  /** The content's height at `width`, set only for a hugging height that measured as content-sized. */
  height?: number
}

interface PreviewState {
  byRef: Readonly<Record<string, Preview>>
}

/**
 * The frames shown at another width, by ref. A preview is a view held in
 * this tab alone: nothing here reaches the server, the history, or the box a
 * gesture writes from, and a reload drops it.
 */
const previewStore = createStore<PreviewState>()(() => ({ byRef: {} }))

export function usePreview(ref: string): Preview | undefined {
  return useStore(previewStore, (state) => state.byRef[ref])
}

/** Every preview, rereading on each change, for a reader drawing several frames. */
export function usePreviews(): PreviewState['byRef'] {
  return useStore(previewStore, (state) => state.byRef)
}

export function previewOf(ref: string): Preview | undefined {
  return previewStore.getState().byRef[ref]
}

export function previewsNow(): PreviewState['byRef'] {
  return previewStore.getState().byRef
}

/** Calls `listener` on each preview change, returning the function that stops. */
export function onPreviewChange(listener: () => void): () => void {
  return previewStore.subscribe(listener)
}

/** Shows each frame named at `width`, dropping a height measured at another one. */
export function setPreview(refs: readonly string[], width: number): void {
  const rounded = Math.max(1, Math.round(width))
  update(refs, (current) =>
    current?.width === rounded ? current : { width: rounded },
  )
}

/** Ends the preview of each frame named, which then draws at its own box. */
export function endPreview(refs: readonly string[]): void {
  update(refs, () => undefined)
}

/** Records the content height a previewed frame measured at its width, or clears it with null. */
export function measurePreview(
  ref: string,
  width: number,
  height: number | null,
): void {
  update([ref], (current) => {
    if (!current || current.width !== width) return current
    if (height === null) {
      return current.height === undefined ? current : { width }
    }
    return current.height === height ? current : { width, height }
  })
}

/**
 * The box a frame draws at under its preview: the previewed width, and the
 * measured height when the frame hugs its height, else its own.
 */
export function previewedBox(
  frame: Pick<FrameRecord, 'hugHeight'>,
  box: Box,
  preview: Preview | undefined,
): Box {
  if (!preview) return box
  const height =
    frame.hugHeight && preview.height !== undefined
      ? preview.height
      : box.height
  return { ...box, width: preview.width, height }
}

/** Each frame at its previewed box, the rest as they are. */
export function previewFrames(
  frames: readonly FrameRecord[],
  previews: Readonly<Record<string, Preview>>,
): FrameRecord[] {
  return frames.map((frame) => {
    const preview = previews[frame.ref]
    return preview
      ? { ...frame, box: previewedBox(frame, frame.box, preview) }
      : frame
  })
}

/** The frames at their previewed boxes, rereading on every preview change. */
export function usePreviewedFrames(
  frames: readonly FrameRecord[],
): FrameRecord[] {
  return previewFrames(frames, usePreviews())
}

/**
 * Drops the preview of each frame a board the server sends no longer shows,
 * one deleted, hidden, or moved to another page, so it never comes back
 * previewed. Returns the function that stops.
 */
export function followPreview(live: LiveStore): () => void {
  return live.subscribe((state, previous) => {
    if (state.board && state.board !== previous.board) settle(state.board)
  })
}

function settle(board: ListResult): void {
  const shown = new Set(
    board.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.flatMap((frame) => (frame.hidden ? [] : [frame.ref])),
      ),
    ),
  )
  const { byRef } = previewStore.getState()
  endPreview(Object.keys(byRef).filter((ref) => !shown.has(ref)))
}

function update(
  refs: readonly string[],
  next: (current: Preview | undefined) => Preview | undefined,
): void {
  const { byRef } = previewStore.getState()
  const changed = { ...byRef }
  let dirty = false
  for (const ref of refs) {
    const preview = next(byRef[ref])
    if (preview === byRef[ref]) continue
    dirty = true
    if (preview) changed[ref] = preview
    else delete changed[ref]
  }
  if (dirty) previewStore.setState({ byRef: changed })
}
