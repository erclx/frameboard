import { createStore } from 'zustand/vanilla'

export const INSPECTOR_TABS = ['design', 'slides', 'export'] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]

/** The id of a tab's trigger, which takes focus from a control leaving with the tab it opened from. */
export function inspectorTabId(tab: InspectorTab): string {
  return `inspector-tab-${tab}`
}

/**
 * The tab the inspector shows, held across selections for the life of the
 * page and never saved, so a reload opens on Design.
 */
export const inspectorTabStore = createStore<{ tab: InspectorTab }>()(() => ({
  tab: 'design',
}))
