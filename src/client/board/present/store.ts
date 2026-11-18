import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { liveStore } from '@/client/live/store'
import {
  resolveTransition,
  transitionNameOf,
} from '@/shared/present-transition'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { select, selectionStore } from '../selection'
import { canvasView } from '../view'
import { readingOrder } from './order'
import { canPlayOwn } from './own-transitions'
import { CUT, prefersReducedMotion, type Travel, travelOf } from './travel'

/**
 * The page presenting and its frame, with the order read from the page each
 * render, so an agent's added or hidden frame joins or leaves at once.
 */
export interface PresentState {
  page: string | null
  frame: string | null
  /**
   * The frame a step left, drawn under the arriving one until its transition
   * ends, null once it has or when the step cut. `id` tells one step's
   * leaving from the next, so a press mid-transition starts a fresh one.
   */
  leaving: { ref: string; travel: Travel; id: number } | null
  /**
   * How many of the shown frame's steps a press has revealed, or `last`
   * on arriving back at a frame whose steps are not read yet, which reads
   * as all of them once they are.
   */
  step: number | 'last'
  /** How many steps the shown frame holds, 0 until its document is read. */
  steps: number
  /** Whether the grid of every slide shows over the stage. */
  overview: boolean
}

export const presentStore = createStore<PresentState>()(() => ({
  page: null,
  frame: null,
  leaving: null,
  step: 0,
  steps: 0,
  overview: false,
}))

export function usePresent<T>(selector: (state: PresentState) => T): T {
  return useStore(presentStore, selector)
}

export function presenting(): boolean {
  return presentStore.getState().page !== null
}

/** Whether the overview is open, which holds the keys that step and leave. */
export function overviewOpen(): boolean {
  return presentStore.getState().overview
}

/** Presenting with the overview shut, when a step or a leave may run. */
export function onStage(): boolean {
  return presenting() && !overviewOpen()
}

/**
 * Opens or shuts the overview, a transition still playing cutting to its
 * slide, so the grid marks where the deck stands.
 */
export function toggleOverview(): void {
  if (!presenting()) return
  presentStore.setState((state) => ({
    overview: !state.overview,
    leaving: null,
  }))
}

/**
 * Shuts the overview on `ref`, cutting there on its first step, since a jump
 * across several slides has no one direction to travel. The slide already
 * shown stays as it stands.
 */
export function jumpPresenting(ref: string): void {
  const { frame } = presentStore.getState()
  if (ref === frame) {
    presentStore.setState({ overview: false })
    return
  }
  presentStore.setState({
    frame: ref,
    leaving: null,
    step: 0,
    steps: 0,
    overview: false,
  })
}

/**
 * The shown frames in reading order, `current` keeping its place once hidden,
 * so the frame on screen stays and a step leaves from where it stands.
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
 * Presents `page`, called inside the press that asked, since the browser grants
 * full screen only under that activation, and a refusal covers the window instead.
 */
export function startPresenting(page: PageRecord): void {
  const { page: selectedPage, frames } = selectionStore.getState()
  const first = startFrame(page.frames, selectedPage === page.ref ? frames : [])
  if (!first) return
  presentStore.setState({
    page: page.ref,
    frame: first.ref,
    leaving: null,
    step: 0,
    steps: 0,
    overview: false,
  })
  document.documentElement.requestFullscreen?.().catch(() => {})
}

/**
 * Steps through the shown frame's steps, then to the next frame, a frame
 * arrived at going back opening on every step, as it was left.
 */
export function stepPresenting(by: 1 | -1): void {
  const { page, frame, steps } = presentStore.getState()
  const step = shownStep()
  if (by > 0 && step < steps) {
    presentStore.setState({ step: step + 1 })
    return
  }
  if (by < 0 && step > 0) {
    presentStore.setState({ step: step - 1 })
    return
  }
  const shown = pageOf(page)
  if (!shown) return
  const order = presentOrder(shown.frames, frame)
  const next = stepWithin(order, frame, by)
  if (!next || next.ref === frame) return
  const from = order.find((candidate) => candidate.ref === frame)
  presentStore.setState({
    frame: next.ref,
    leaving: from ? leavingOf(shown, from, next, by) : null,
    step: by > 0 ? 0 : 'last',
    steps: 0,
  })
}

/** The steps the shown frame has revealed, `last` read as all of them. */
export function shownStep(): number {
  const { step, steps } = presentStore.getState()
  return step === 'last' ? steps : Math.min(step, steps)
}

/**
 * Records how many steps the shown frame's document holds, read on each
 * load and each change an agent makes. A frame arrived at going back stays
 * on its last step until the next press, however many it turns out to hold.
 */
export function countSteps(steps: number): void {
  const { step } = presentStore.getState()
  presentStore.setState({
    steps,
    step: step === 'last' ? 'last' : Math.min(step, steps),
  })
}

let steps = 0

/**
 * What a step leaves drawn under the arriving frame, a project transition
 * whose keyframes have not arrived cutting, so no step plays half of one.
 */
function leavingOf(
  page: PageRecord,
  from: FrameRecord,
  to: FrameRecord,
  by: 1 | -1,
): PresentState['leaving'] {
  const back = by < 0
  const transition = resolveTransition(
    page.transition,
    (back ? from : to).transition,
  )
  const travel = travelOf(transition, back, prefersReducedMotion())
  if (travel === CUT) return null
  if (
    !transitionNameOf(transition.name) &&
    !canPlayOwn(page.project, transition.name)
  ) {
    return null
  }
  steps += 1
  return { ref: from.ref, travel, id: steps }
}

/** Ends the transition of step `id`, leaving a later step's alone. */
export function endTransition(id: number): void {
  if (presentStore.getState().leaving?.id === id) {
    presentStore.setState({ leaving: null })
  }
}

/**
 * Ends presenting and returns to the board with the presented frame
 * selected and in view, leaving full screen when it is still on. Writes
 * nothing to the board and records no undo step.
 */
export function leavePresenting(): void {
  const { page, frame } = presentStore.getState()
  if (page === null) return
  presentStore.setState({
    page: null,
    frame: null,
    leaving: null,
    step: 0,
    steps: 0,
    overview: false,
  })
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  const shown = pageOf(page)?.frames.find(
    (candidate) => candidate.ref === frame,
  )
  if (!shown || shown.hidden) return
  select(selectionStore, page, [shown.ref])
  canvasView.reveal(shown.box)
}
