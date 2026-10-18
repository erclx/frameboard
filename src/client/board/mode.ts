import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

/** Edit selects and arranges frames, and Play hands the clicks to them. */
export type Mode = 'edit' | 'play'

/** Frame and Note are listed here so the rows registering those tools set them without reshaping this. */
export type Tool = 'move' | 'hand' | 'frame' | 'note'

export interface ModeState {
  mode: Mode
  tool: Tool
  /** Both panels hidden, leaving the project and zoom pills and the toolbar. */
  hideUi: boolean
}

/** Below this the board opens with its UI hidden, and the canvas keeps the screen. */
export const NARROW_WIDTH = 1024

export type ModeStore = StoreApi<ModeState>

/** A store opening hidden when the window it opens in is narrow. */
export function createModeStore(width: number): ModeStore {
  return createStore<ModeState>()(() => ({
    mode: 'edit',
    tool: 'move',
    hideUi: width < NARROW_WIDTH,
  }))
}

/**
 * The board's one mode store, kept apart from the live store since nothing
 * here comes from the server. It reads the width once, at load, so resizing
 * across 1024 later leaves Hide UI where the developer put it.
 */
export const modeStore = createModeStore(window.innerWidth)

export function useMode<T>(selector: (state: ModeState) => T): T {
  return useStore(modeStore, selector)
}
