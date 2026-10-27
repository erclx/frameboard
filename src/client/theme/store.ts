import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { movedKeys } from '@/client/live/store'
import { isTheme, oppositeTheme, type Theme } from '@/shared/theme'

/** What the developer picked: a theme, or to follow the system. */
export type ThemeChoice = 'system' | Theme

export interface ThemeState {
  choice: ThemeChoice
  /** The system theme, which the board shows while the choice is `system`. */
  system: Theme
  /** Frames flipped to the opposite of the board's theme, held until the page reloads. */
  flipped: ReadonlySet<string>
}

export type ThemeStore = StoreApi<ThemeState>

/** Where the choice persists, in the `frameboard.home.layout` form. */
export const THEME_KEY = 'frameboard.theme'

/** What `connectTheme` reads and writes, a window's parts in the app. */
export interface ThemeHost {
  /** Null when the browser refuses storage, which keeps the choice for this visit. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** The `prefers-color-scheme: dark` query. */
  media: Pick<
    MediaQueryList,
    'matches' | 'addEventListener' | 'removeEventListener'
  >
  /** The element carrying the chrome's `.dark` class. */
  root: Element
}

export function createThemeStore(): ThemeStore {
  return createStore<ThemeState>()(() => ({
    choice: 'system',
    system: 'light',
    flipped: new Set(),
  }))
}

/** The theme the board shows. */
export function shownTheme({ choice, system }: ThemeState): Theme {
  return choice === 'system' ? system : choice
}

/**
 * Reads the saved choice and the system theme into `store`, follows the
 * system while the choice is `system`, saves each new choice, and sets
 * `.dark` on the root on every change. Returns the function that stops it.
 */
export function connectTheme(store: ThemeStore, host: ThemeHost): () => void {
  const apply = (state: ThemeState) => {
    host.root.classList.toggle('dark', shownTheme(state) === 'dark')
  }
  const onSystem = () => {
    store.setState({ system: host.media.matches ? 'dark' : 'light' })
  }

  store.setState({ choice: readChoice(host.storage) })
  onSystem()
  apply(store.getState())
  host.media.addEventListener('change', onSystem)
  const unsubscribe = store.subscribe((state, previous) => {
    apply(state)
    if (state.choice !== previous.choice)
      writeChoice(host.storage, state.choice)
  })
  return () => {
    unsubscribe()
    host.media.removeEventListener('change', onSystem)
  }
}

/** The app's host: the window's storage, its dark query, and the document's root. */
export function windowThemeHost(win: Window): ThemeHost {
  let storage: ThemeHost['storage']
  try {
    storage = win.localStorage
  } catch {
    storage = null
  }
  return {
    storage,
    media: win.matchMedia('(prefers-color-scheme: dark)'),
    root: win.document.documentElement,
  }
}

export function chooseTheme(
  choice: ThemeChoice,
  store: ThemeStore = themeStore,
): void {
  store.setState({ choice })
}

/** Switches to the opposite of the theme shown and saves that as the choice. */
export function toggleTheme(store: ThemeStore = themeStore): void {
  store.setState({ choice: oppositeTheme(shownTheme(store.getState())) })
}

/** Flips one frame to the opposite of the board's theme, or back. */
export function flipFrame(ref: string, store: ThemeStore = themeStore): void {
  const flipped = new Set(store.getState().flipped)
  if (!flipped.delete(ref)) flipped.add(ref)
  store.setState({ flipped })
}

/** Moves the flipped frames under a renamed project or page to their new refs. */
export function renameFlipped(
  before: string,
  after: string,
  store: ThemeStore = themeStore,
): void {
  const byRef = Object.fromEntries(
    [...store.getState().flipped].map((ref) => [ref, true]),
  )
  store.setState({
    flipped: new Set(Object.keys(movedKeys(byRef, before, after))),
  })
}

/** The theme one frame shows, being the board's unless it is flipped. */
export function frameTheme(ref: string, store: ThemeStore = themeStore): Theme {
  return themeOf(store.getState(), ref)
}

export function useShownTheme(store: ThemeStore = themeStore): Theme {
  return useStore(store, shownTheme)
}

export function useFrameTheme(
  ref: string,
  store: ThemeStore = themeStore,
): Theme {
  return useStore(store, (state) => themeOf(state, ref))
}

function themeOf(state: ThemeState, ref: string): Theme {
  const shown = shownTheme(state)
  return state.flipped.has(ref) ? oppositeTheme(shown) : shown
}

function readChoice(storage: ThemeHost['storage']): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_KEY)
    return isTheme(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

function writeChoice(storage: ThemeHost['storage'], choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_KEY, choice)
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}

/** The one store the app's chrome and frames read. */
export const themeStore = createThemeStore()
