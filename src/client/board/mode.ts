import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

/** Edit selects and arranges frames, and Play hands the clicks to them. */
export type Mode = 'edit' | 'play'

/**
 * Text, Shape, and Image place an element into a frame, Shape the one
 * `place/tool` last chose and Image the file it armed.
 */
export type Tool =
  | 'move'
  | 'hand'
  | 'frame'
  | 'note'
  | 'text'
  | 'shape'
  | 'image'

export interface ModeState {
  mode: Mode
  tool: Tool
  /** Both panels hidden, leaving the project and zoom pills and the toolbar. */
  hideUi: boolean
  /**
   * Space held on the canvas, under which a primary drag pans whatever the
   * tool. Cleared on keyup and when the window loses focus, so it never sticks.
   */
  spacePan: boolean
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
    spacePan: false,
  }))
}

/**
 * Holds `spacePan` while Space is down outside a field, a button, a menu, or
 * a dialog, where Space types or presses. Space is held while a pointer
 * moves, so it is a gesture here rather than a registry key. Returns the
 * function that stops listening.
 */
export function followSpacePan(
  target: Window,
  store: ModeStore = modeStore,
): () => void {
  const down = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || claimsSpace(event.target)) return
    // Space would otherwise scroll the page or press what has focus.
    event.preventDefault()
    if (!store.getState().spacePan) store.setState({ spacePan: true })
  }
  const release = () => {
    if (store.getState().spacePan) store.setState({ spacePan: false })
  }
  const up = (event: KeyboardEvent) => {
    if (event.code === 'Space') release()
  }
  target.addEventListener('keydown', down)
  target.addEventListener('keyup', up)
  target.addEventListener('blur', release)
  return () => {
    target.removeEventListener('keydown', down)
    target.removeEventListener('keyup', up)
    target.removeEventListener('blur', release)
    release()
  }
}

function claimsSpace(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return (
    target.closest(
      'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], [role="menu"], [role="menuitem"], [role="dialog"], [role="option"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [role="button"]',
    ) != null
  )
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
