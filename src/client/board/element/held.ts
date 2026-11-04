import { createStore } from 'zustand/vanilla'

import type { Box } from '../geometry/box'
import type { ElementKey } from '../selection'
import type { ResizeRead } from './resize'

/** A released free drag's outline, held at the drop in canvas units. */
export interface HeldOutline {
  key: ElementKey
  box: Box
  /** How the element took a corner resize at release, which keeps its marks through the reload. */
  read: ResizeRead | null
}

/**
 * The outline a free drag dropped, drawn in place of the measured box until
 * the reloaded frame measures the element again. The measured box still holds
 * the start until then, since `ResizeObserver` fires on a size change and
 * never on a move, and the written element takes a new key the frame does
 * not show yet.
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
