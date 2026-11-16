/**
 * The side panels' sizes and where their widths are remembered, read by the
 * board screen and by its loading shell, so the two open at one width.
 */

/** Pixels, since a bare string reads as percent and 300 would mean 300 percent. */
export const PANEL = { defaultSize: 240, minSize: 200, maxSize: 400 } as const

/** Where the panel widths are remembered between loads. */
export const LAYOUT_ID = 'frameboard.board.panels'

/** A browser refusing storage keeps the widths for this visit alone. */
export const panelStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Nothing to keep the widths in, so they last until the tab closes.
    }
  },
}
