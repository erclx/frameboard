import type { Browser } from 'playwright-core'
import { describe, expect, it } from 'vitest'

import { createWarmRenderer } from './render'

const FRAME = { ref: 'studio/home/hero', box: { width: 10, height: 10 } }

/** A browser whose every context fails to open, recording whether it was closed. */
function stubBrowser() {
  const state = { closed: false }
  const browser = {
    newContext: async () => {
      throw new Error('No context in a stub.')
    },
    close: async () => {
      state.closed = true
    },
  } as unknown as Browser
  return { browser, state }
}

describe('createWarmRenderer', () => {
  it('launches one browser across renders', async () => {
    const { browser } = stubBrowser()
    let launches = 0
    const renderer = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      launch: async () => {
        launches += 1
        return browser
      },
    })

    await Promise.allSettled([
      renderer.render(FRAME, 'light'),
      renderer.render(FRAME, 'dark'),
    ])

    expect(launches).toBe(1)
  })

  it('launches again after a launch failed', async () => {
    const { browser } = stubBrowser()
    const outcomes = [new Error('No browser.'), browser]
    const renderer = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      launch: async () => {
        const next = outcomes.shift()
        if (next instanceof Error) throw next
        if (!next) throw new Error('Launched too often.')
        return next
      },
    })

    await expect(renderer.render(FRAME, 'light')).rejects.toThrow('No browser.')
    await expect(renderer.render(FRAME, 'light')).rejects.toThrow(
      'No context in a stub.',
    )
  })

  it('closes a browser still launching when the server closes', async () => {
    const { browser, state } = stubBrowser()
    let finishLaunch: (browser: Browser) => void = () => {}
    const renderer = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      launch: () =>
        new Promise<Browser>((resolve) => {
          finishLaunch = resolve
        }),
    })

    const rendering = renderer.render(FRAME, 'light')
    await Promise.resolve()
    const closing = renderer.close()
    finishLaunch(browser)
    await closing
    await rendering.catch(() => {})

    expect(state.closed).toBe(true)
  })

  it('refuses a render once closed', async () => {
    const { browser } = stubBrowser()
    const renderer = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      launch: async () => browser,
    })

    await renderer.close()

    await expect(renderer.render(FRAME, 'light')).rejects.toThrow('closing')
  })
})
