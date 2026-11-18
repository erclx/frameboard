import { createStore } from 'zustand/vanilla'

import type { ResizeRead } from '@/shared/frame-bridge/live-element'

import type { Box } from '../geometry/box'
import type { ElementKey } from '../selection'

/** A released free drag's outline, held at the drop in canvas units. */
export interface HeldOutline {
  key: ElementKey
  box: Box
  /** How the element took a corner resize at release, which keeps its marks through the reload. */
  read: ResizeRead | null
}

/**
 * The outline a free drag dropped, drawn until the reloaded frame measures
 * the element again, since `ResizeObserver` never fires on a move.
 */
export const heldStore = createStore<{ held: HeldOutline | null }>()(() => ({
  held: null,
}))

/** Holds the outline at a released drop, or lets it go with null. */
export function holdOutline(held: HeldOutline | null): void {
  heldStore.setState({ held })
}

export function heldOutline(): HeldOutline | null {
  return heldStore.getState().held
}
