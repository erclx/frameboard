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

/**
 * The attribute on the injected style holding the SHA-256 hex of the bytes
 * the route served, so a live frame names the exact file an edit addresses.
 */
export const RENDERED_HASH = 'data-hash'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Shows a frame's root in `theme`: `data-theme`, `color-scheme`, and the
 * `.dark` or `.light` class, the selectors a token sheet reads. The frame
 * route embeds this function's source in the script it injects, so it uses
 * nothing from outside its own body.
 */
export function setFrameTheme(root: HTMLElement, theme: Theme): void {
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
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
