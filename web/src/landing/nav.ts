type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/**
 * Wires the bar's theme button. A stored choice arrives as `data-theme` on
 * the root, set before first paint by `public/theme-init.js`, and with none
 * the page follows the system. A click sets the other theme and stores it.
 */
export function wireThemeButton(
  button: HTMLButtonElement,
  root: HTMLElement = document.documentElement,
): void {
  const label = (): void => {
    const next = currentTheme(root) === 'dark' ? 'light' : 'dark'
    button.setAttribute('aria-label', `Switch to ${next} theme`)
  }
  syncThemedSources(root)
  label()
  button.addEventListener('click', () => {
    const next: Theme = currentTheme(root) === 'dark' ? 'light' : 'dark'
    root.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A blocked store still switches this visit, it just is not kept.
    }
    syncThemedSources(root)
    label()
  })
}

/** Draws the bar's bottom line once the page has scrolled at all. */
export function wireBarLine(bar: HTMLElement): void {
  const edge = (): void => {
    bar.toggleAttribute('data-scrolled', window.scrollY > 0)
  }
  window.addEventListener('scroll', edge, { passive: true })
  edge()
}

function currentTheme(root: HTMLElement): Theme {
  const stored = storedTheme(root)
  if (stored) return stored
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedTheme(root: HTMLElement): Theme | undefined {
  const value = root.getAttribute('data-theme')
  return value === 'light' || value === 'dark' ? value : undefined
}

/**
 * A `<source>` media query reads the system theme and never `data-theme`, so
 * each source marked `data-dark-media` is pointed at the stored choice: its
 * dark-only query when dark is chosen, never when light is, and its own
 * system query again when nothing is stored.
 */
function syncThemedSources(root: HTMLElement): void {
  const stored = storedTheme(root)
  for (const source of root.ownerDocument.querySelectorAll<HTMLSourceElement>(
    'source[data-dark-media]',
  )) {
    source.dataset.systemMedia ??= source.getAttribute('media') ?? ''
    const media =
      stored === 'dark'
        ? (source.dataset.darkMedia ?? '')
        : stored === 'light'
          ? 'not all'
          : source.dataset.systemMedia
    source.setAttribute('media', media)
  }
}
