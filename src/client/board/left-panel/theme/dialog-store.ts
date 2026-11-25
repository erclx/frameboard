import { createStore } from 'zustand/vanilla'

import type { TokenRow } from '@/shared/records/tokens'

/** What the Theme dialog lists and shows one of, a token group under its own name. */
export type ThemeSection = 'kits' | 'fonts' | TokenRow['group']

/** How many each section holds, null while that is unread. */
export type ThemeCounts = Record<ThemeSection, number | null>

/** The card or button it opened from, a card under the section it opens. */
export type ThemeOpener = ThemeSection | 'edit'

interface ThemeDialogState {
  open: boolean
  section: ThemeSection
  /** What takes the focus back on close, null for a close handing it elsewhere. */
  opener: ThemeOpener | null
  /** Whether the Kits section's Add kit list is open, which the palette's Add kit opens. */
  addingKit: boolean
}

/** The Theme dialog, held here so the cards, the palette, and a kit's note reach it. */
export const themeDialogStore = createStore<ThemeDialogState>()(() => ({
  open: false,
  section: 'kits',
  opener: null,
  addingKit: false,
}))

export function openTheme(section: ThemeSection, opener: ThemeOpener): void {
  themeDialogStore.setState({ open: true, section, opener, addingKit: false })
}

/** Closes the dialog, handing the focus back to what opened it unless it goes elsewhere. */
export function closeTheme({ focusBack = true } = {}): void {
  themeDialogStore.setState((state) => ({
    open: false,
    opener: focusBack ? state.opener : null,
    addingKit: false,
  }))
}

export function showThemeSection(section: ThemeSection): void {
  themeDialogStore.setState({ section, addingKit: false })
}
