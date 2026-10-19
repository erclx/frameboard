import { createStore } from 'zustand/vanilla'

export interface GlowState {
  /** The frames glowing now, each with the play that lit it. */
  glowing: Readonly<Record<string, number>>
  /** Frames Show asked to glow again, played once their frame shows the change. */
  replays: Readonly<Record<string, true>>
}

/** Which frames glow, read by the toast, and which Show asked to glow again. */
export const glowStore = createStore<GlowState>()(() => ({
  glowing: {},
  replays: {},
}))

/** The changes that have glowed once, so a page switch or a remount never plays one twice. */
export const played = new Set<string>()

/** Asks the frame's latest change to glow again, as Show does. */
export function replayGlow(ref: string): void {
  glowStore.setState((state) => ({
    replays: { ...state.replays, [ref]: true },
  }))
}
