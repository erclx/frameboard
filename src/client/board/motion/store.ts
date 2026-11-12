import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/**
 * A frame the board drives rather than leaving on its own clock: held still
 * at `at`, or playing on from it, which moves `at` every animation frame.
 */
export interface MotionHold {
  /** The moment in ms the frame shows. */
  at: number
  playing: boolean
}

interface MotionState {
  byRef: Readonly<Record<string, MotionHold>>
}

/**
 * The frames the board holds or plays, by ref. A hold is a view in this tab
 * alone: nothing here reaches the server, the history, or another tab, and
 * a reload drops it, so every frame runs from its own clock again.
 */
const motionStore = createStore<MotionState>()(() => ({ byRef: {} }))

export function useMotionHold(ref: string): MotionHold | undefined {
  return useStore(motionStore, (state) => state.byRef[ref])
}

export function motionHoldOf(ref: string): MotionHold | undefined {
  return motionStore.getState().byRef[ref]
}

/** Calls `listener` on each change to any hold, returning the function that stops. */
export function onMotionHoldChange(listener: () => void): () => void {
  return motionStore.subscribe(listener)
}

/** Holds the frame still at `at`, pausing it when it was playing. */
export function holdMotion(ref: string, at: number): void {
  write(ref, { at: Math.max(0, at), playing: false })
}

/** Plays the frame on from the moment it holds, or from `at` when given. */
export function playMotion(ref: string, at?: number): void {
  const current = motionHoldOf(ref)
  write(ref, { at: Math.max(0, at ?? current?.at ?? 0), playing: true })
}

/** Moves a playing frame's moment, leaving a held or free frame as it is. */
export function advanceMotion(ref: string, at: number): void {
  const current = motionHoldOf(ref)
  if (current?.playing) write(ref, { at, playing: true })
}

/** Hands the frame back to its own clock. */
export function releaseMotion(ref: string): void {
  const { byRef } = motionStore.getState()
  if (!(ref in byRef)) return
  const { [ref]: _released, ...rest } = byRef
  motionStore.setState({ byRef: rest })
}

function write(ref: string, hold: MotionHold): void {
  const { byRef } = motionStore.getState()
  const current = byRef[ref]
  if (current?.at === hold.at && current.playing === hold.playing) return
  motionStore.setState({ byRef: { ...byRef, [ref]: hold } })
}

/** A moment in ms as seconds to two places, so a 2 s slide reads finer than whole seconds. */
export function formatMoment(ms: number): string {
  return (ms / 1000).toFixed(2)
}
