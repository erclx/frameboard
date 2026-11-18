import { createStore } from 'zustand/vanilla'

export type LeftTab = 'design' | 'theme' | 'assets'

/**
 * The tab the left panel shows, held here so a palette action can open one,
 * and never saved, so a reload opens on Design.
 */
export const leftTabStore = createStore<{ tab: LeftTab }>()(() => ({
  tab: 'design',
}))
