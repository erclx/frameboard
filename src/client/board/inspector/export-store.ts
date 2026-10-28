import { createStore, type StoreApi } from 'zustand/vanilla'

import type { Theme } from '@/shared/theme'

export type ExportScale = 1 | 2 | 3
export type ExportTheme = Theme | 'both'

export const SCALES: readonly ExportScale[] = [1, 2, 3]
export const THEME_OPTIONS: readonly { value: ExportTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'both', label: 'Both themes' },
]

/** The scale and theme the Export section last picked, carried across frames for the session. */
export const exportStore: StoreApi<{
  scale: ExportScale
  theme: ExportTheme
}> = createStore<{ scale: ExportScale; theme: ExportTheme }>()(() => ({
  scale: 2,
  theme: 'both',
}))
