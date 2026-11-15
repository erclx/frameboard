import { createStore } from 'zustand/vanilla'

export const INSPECTOR_TABS = ['design', 'slides', 'export'] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]

/**
 * The tab the inspector shows, held across selections for the life of the
 * page and never saved, so a reload opens on Design.
 */
export const inspectorTabStore = createStore<{ tab: InspectorTab }>()(() => ({
  tab: 'design',
}))
