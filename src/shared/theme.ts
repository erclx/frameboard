import { frameUrl } from './board-urls'

export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** The query a frame is served with, which its injected script sets `data-theme` from. */
export const THEME_QUERY = 'theme'

/**
 * The attribute on every element the frame route injects. A reader counting
 * a live frame's elements skips the ones carrying it, so the live index
 * matches the file's.
 */
export const LOOK_MARKER = 'data-frameboard'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/**
 * Where a frame is served in one theme, with `version` naming the reload so
 * a changed file loads fresh.
 */
export function frameThemeUrl(
  ref: string,
  theme: Theme,
  version?: number,
): string {
  const query = new URLSearchParams({ [THEME_QUERY]: theme })
  if (version !== undefined) query.set('v', String(version))
  return `${frameUrl(ref)}?${query}`
}
