import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  chooseTheme,
  connectTheme,
  createThemeStore,
  flipFrame,
  frameTheme,
  renameFlipped,
  shownTheme,
  THEME_KEY,
  type ThemeHost,
  type ThemeStore,
  toggleTheme,
} from './store'

/** A dark query whose answer the test sets, and a storage held in a map. */
function fakeHost({
  dark = false,
  saved,
}: { dark?: boolean; saved?: string } = {}) {
  const media = Object.assign(new EventTarget(), { matches: dark })
  const values = new Map<string, string>(
    saved === undefined ? [] : [[THEME_KEY, saved]],
  )
  const host: ThemeHost = {
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    },
    media,
    root: document.createElement('html'),
  }
  return {
    host,
    values,
    setSystem(next: 'light' | 'dark') {
      media.matches = next === 'dark'
      media.dispatchEvent(new Event('change'))
    },
  }
}

describe('theme store', () => {
  let store: ThemeStore
  let disconnect: () => void

  beforeEach(() => {
    store = createThemeStore()
    disconnect = () => {}
  })

  afterEach(() => {
    disconnect()
  })

  it('follows the system theme while nothing was chosen', () => {
    const fake = fakeHost({ dark: true })
    disconnect = connectTheme(store, fake.host)

    fake.setSystem('light')

    expect(shownTheme(store.getState())).toBe('light')
    expect(fake.host.root.classList.contains('dark')).toBe(false)
  })

  it('sets .dark on the root when the system is dark', () => {
    const fake = fakeHost({ dark: true })

    disconnect = connectTheme(store, fake.host)

    expect(fake.host.root.classList.contains('dark')).toBe(true)
  })

  it('reads a saved choice over the system theme', () => {
    const fake = fakeHost({ dark: false, saved: 'dark' })

    disconnect = connectTheme(store, fake.host)

    expect(shownTheme(store.getState())).toBe('dark')
  })

  it('reads a saved value that is no theme as following the system', () => {
    const fake = fakeHost({ dark: true, saved: 'sepia' })

    disconnect = connectTheme(store, fake.host)

    expect(store.getState().choice).toBe('system')
  })

  it('toggles to the opposite of the theme shown and saves it', () => {
    const fake = fakeHost({ dark: true })
    disconnect = connectTheme(store, fake.host)

    toggleTheme(store)

    expect(shownTheme(store.getState())).toBe('light')
    expect(fake.values.get(THEME_KEY)).toBe('light')
    expect(fake.host.root.classList.contains('dark')).toBe(false)
  })

  it('stops following the system once a theme is chosen', () => {
    const fake = fakeHost({ dark: false })
    disconnect = connectTheme(store, fake.host)
    chooseTheme('light', store)

    fake.setSystem('dark')

    expect(shownTheme(store.getState())).toBe('light')
  })

  it('follows the system again once system is chosen', () => {
    const fake = fakeHost({ dark: false, saved: 'light' })
    disconnect = connectTheme(store, fake.host)
    chooseTheme('system', store)

    fake.setSystem('dark')

    expect(shownTheme(store.getState())).toBe('dark')
    expect(fake.values.get(THEME_KEY)).toBe('system')
  })

  it('keeps a choice for the visit when storage refuses it', () => {
    const fake = fakeHost()
    fake.host.storage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    disconnect = connectTheme(store, fake.host)

    chooseTheme('dark', store)

    expect(shownTheme(store.getState())).toBe('dark')
  })

  describe('flipped frames', () => {
    it('shows a flipped frame in the opposite theme and the rest in the board theme', () => {
      chooseTheme('dark', store)

      flipFrame('site/home/a', store)

      expect(frameTheme('site/home/a', store)).toBe('light')
      expect(frameTheme('site/home/b', store)).toBe('dark')
    })

    it('keeps a flipped frame opposite when the board theme changes', () => {
      chooseTheme('dark', store)
      flipFrame('site/home/a', store)

      chooseTheme('light', store)

      expect(frameTheme('site/home/a', store)).toBe('dark')
    })

    it('returns a frame flipped twice to the board theme', () => {
      chooseTheme('dark', store)
      flipFrame('site/home/a', store)

      flipFrame('site/home/a', store)

      expect(frameTheme('site/home/a', store)).toBe('dark')
    })

    it('keeps a flipped frame flipped under its new ref through a page rename', () => {
      chooseTheme('dark', store)
      flipFrame('site/home/a', store)

      renameFlipped('site/home', 'site/start', store)

      expect(frameTheme('site/start/a', store)).toBe('light')
      expect(frameTheme('site/home/a', store)).toBe('dark')
    })

    it('keeps a flipped frame flipped through a project rename', () => {
      chooseTheme('dark', store)
      flipFrame('site/about/a', store)

      renameFlipped('site', 'studio', store)

      expect(frameTheme('studio/about/a', store)).toBe('light')
    })

    it('drops a flip a page gone before the rename left under the new name', () => {
      chooseTheme('dark', store)
      flipFrame('site/start/a', store)

      renameFlipped('site/home', 'site/start', store)

      expect(frameTheme('site/start/a', store)).toBe('dark')
    })
  })
})
