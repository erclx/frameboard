import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { liveStore } from '@/client/live/store'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { select, selectionStore } from '../selection'
import { canvasView } from '../view'
import { readingOrder } from './order'

/**
 * The page presenting and the frame it shows, by ref, both null while
 * nothing presents. The order is read from the page on every render rather
 * than held here, so a frame an agent adds or hides mid-talk joins or leaves
 * it at once.
 */
export interface PresentState {
  page: string | null
  frame: string | null
}

export const presentStore = createStore<PresentState>()(() => ({
  page: null,
  frame: null,
}))

export function usePresent<T>(selector: (state: PresentState) => T): T {
  return useStore(presentStore, selector)
}

export function presenting(): boolean {
  return presentStore.getState().page !== null
}

/**
 * The frames presenting steps through, in canvas reading order per
 * `readingOrder`, with the hidden ones left out. `current` keeps its place
 * even once hidden, so the frame on screen stays shown and a step leaves
 * from where it stands. `frames` arrives as the server sends a page's.
 */
export function presentOrder(
  frames: readonly FrameRecord[],
  current: string | null,
): FrameRecord[] {
  return readingOrder(frames).filter(
    (frame) => !frame.hidden || frame.ref === current,
  )
}

/**
 * The frame presenting opens on: the first selected one in reading order,
 * or when that is hidden the next shown frame after it, and the first shown
 * frame with nothing selected. Undefined when the page shows no frame.
 */
export function startFrame(
  frames: readonly FrameRecord[],
  selected: readonly string[],
): FrameRecord | undefined {
  const order = readingOrder(frames)
  const first = order.find((frame) => !frame.hidden)
  const at = order.findIndex((frame) => selected.includes(frame.ref))
  if (at === -1) return first
  return order.slice(at).find((frame) => !frame.hidden) ?? first
}

/** The frame a step of `by` lands on, staying put past either end. */
export function stepWithin(
  order: readonly FrameRecord[],
  ref: string | null,
  by: 1 | -1,
): FrameRecord | undefined {
  const at = order.findIndex((frame) => frame.ref === ref)
  if (at === -1) return order[0]
  return order[Math.min(Math.max(at + by, 0), order.length - 1)]
}

/** The page by ref, read from the board the server last sent. */
export function pageOf(ref: string | null): PageRecord | undefined {
  if (ref === null) return undefined
  return liveStore
    .getState()
    .board?.projects.flatMap((project) => project.pages)
    .find((page) => page.ref === ref)
}

/**
 * Presents `page` from the frame `startFrame` picks, asking for the whole
 * document full screen. Called inside the press or click that asked for it,
 * since the browser grants full screen only under that activation. A refusal
 * leaves the overlay covering the window instead.
 */
export function startPresenting(page: PageRecord): void {
  const { page: selectedPage, frames } = selectionStore.getState()
  const first = startFrame(page.frames, selectedPage === page.ref ? frames : [])
  if (!first) return
  presentStore.setState({ page: page.ref, frame: first.ref })
  document.documentElement.requestFullscreen?.().catch(() => {})
}

/** Shows the frame a step of `by` lands on, staying on the last or the first. */
export function stepPresenting(by: 1 | -1): void {
  const { page, frame } = presentStore.getState()
  const shown = pageOf(page)
  if (!shown) return
  const next = stepWithin(presentOrder(shown.frames, frame), frame, by)
  if (next && next.ref !== frame) presentStore.setState({ frame: next.ref })
}

/**
 * Ends presenting and returns to the board with the presented frame
 * selected and in view, leaving full screen when it is still on. Writes
 * nothing to the board and records no undo step.
 */
export function leavePresenting(): void {
  const { page, frame } = presentStore.getState()
  if (page === null) return
  presentStore.setState({ page: null, frame: null })
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  const shown = pageOf(page)?.frames.find(
    (candidate) => candidate.ref === frame,
  )
  if (!shown || shown.hidden) return
  select(selectionStore, page, [shown.ref])
  canvasView.reveal(shown.box)
}
