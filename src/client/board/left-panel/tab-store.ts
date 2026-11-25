import { createStore } from 'zustand/vanilla'

export type LeftTab = 'design' | 'theme' | 'assets'

/**
 * The tab the left panel shows, held here so a palette action can open one,
 * and never saved, so a reload opens on Design. Another project opens on
 * Design too, which `project` tracks.
 */
export const leftTabStore = createStore<{
  tab: LeftTab
  /** The project the panel last showed, null before it first mounts. */
  project: string | null
}>()(() => ({
  tab: 'design',
  project: null,
}))

/** Follows a rename of the project the panel last showed, so it keeps its tab. */
export function renameLeftTab(before: string, after: string): void {
  if (leftTabStore.getState().project === before) {
    leftTabStore.setState({ project: after })
  }
}
