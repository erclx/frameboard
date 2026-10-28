import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { type FrameHost, startFrameHost } from './host'
import {
  assertScreenshotFits,
  createWarmBrowser,
  createWarmRenderer,
  openFrame,
} from './render'

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

describe('createWarmBrowser', () => {
  it('launches once for every consumer holding it', async () => {
    const { browser } = stubBrowser()
    let launches = 0
    const warm = createWarmBrowser(async () => {
      launches += 1
      return browser
    })
    const render = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      browser: warm,
      scale: 2,
    })

    await Promise.allSettled([render(FRAME, 'light'), warm.get()])

    expect(launches).toBe(1)
  })

  it('launches again after a launch failed', async () => {
    const { browser } = stubBrowser()
    const outcomes = [new Error('No browser.'), browser]
    const warm = createWarmBrowser(async () => {
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error('Launched too often.')
      return next
    })

    await expect(warm.get()).rejects.toThrow('No browser.')
    await expect(warm.get()).resolves.toBe(browser)
  })

  it('closes a browser still launching when the server closes', async () => {
    const { browser, state } = stubBrowser()
    let finishLaunch: (browser: Browser) => void = () => {}
    const warm = createWarmBrowser(
      () =>
        new Promise<Browser>((resolve) => {
          finishLaunch = resolve
        }),
    )

    const launching = warm.get()
    const closing = warm.close()
    finishLaunch(browser)
    await closing
    await launching

    expect(state.closed).toBe(true)
  })

  it('refuses a render once closed', async () => {
    const { browser } = stubBrowser()
    const warm = createWarmBrowser(async () => browser)
    const render = createWarmRenderer({
      baseUrl: () => 'http://127.0.0.1:1',
      browser: warm,
      scale: 2,
    })

    await warm.close()

    await expect(render(FRAME, 'light')).rejects.toThrow('closing')
  })
})

describe('assertScreenshotFits', () => {
  it('passes a frame reaching exactly 16384 device pixels', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 8192, height: 900 }, 2),
    ).not.toThrow()
  })

  it('refuses capture-too-large one device pixel past the limit', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 1440, height: 16385 }, 1),
    ).toThrow(
      expect.objectContaining({
        code: 'capture-too-large',
        details: expect.objectContaining({ ref: FRAME.ref, scale: 1 }),
      }),
    )
  })

  it('names the scale when the scale pushes a frame past the limit', () => {
    expect(() =>
      assertScreenshotFits(FRAME.ref, { width: 1440, height: 6000 }, 3),
    ).toThrow(/at 3x/)
  })
})

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)('openFrame', () => {
  const ref = 'studio/home/hero'
  let browser: Browser
  let host: FrameHost
  let board: TempBoard
  let faces: string

  beforeAll(async () => {
    browser = requireShell(shell)
    faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
    board = writeBoard({
      'studio/home/hero.html':
        '<p style="font-family: \'Not Installed Face\'">Hello</p>',
      'studio/home/layout.json': JSON.stringify({
        version: 1,
        frames: { hero: { x: 0, y: 0, width: 200, height: 100, order: 0 } },
      }),
    })
    host = await startFrameHost({ root: board.root, facesDir: faces })
  }, SHELL_HOOK_TIMEOUT_MS)

  afterAll(async () => {
    await host.close()
    board.cleanup()
    rmSync(faces, { recursive: true, force: true })
  }, SHELL_HOOK_TIMEOUT_MS)

  it('refuses font-missing for a face that is not installed', async () => {
    const opening = openFrame(browser, {
      baseUrl: host.url,
      ref,
      box: { width: 200, height: 100 },
      theme: 'light',
    })

    await expect(opening).rejects.toMatchObject({ code: 'font-missing' })
  })

  it('loads the same frame in its fallback under fonts wait', async () => {
    const opened = await openFrame(browser, {
      baseUrl: host.url,
      ref,
      box: { width: 200, height: 100 },
      theme: 'light',
      fonts: 'wait',
    })
    const text = await opened.page.textContent('p')
    await opened.close()

    expect(text).toBe('Hello')
  })
})

describe.skipIf(shell === null)(
  'createWarmRenderer',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let host: FrameHost
    let board: TempBoard
    let faces: string

    beforeAll(async () => {
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    it('answers a PNG at the scale it was made with', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 0.5,
      })

      const bytes = await render(
        { ref: 'studio/home/hero', box: { width: 200, height: 100 } },
        'light',
      )

      // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        100, 50,
      ])
    })

    it('answers a PNG at the scale a call asks for over its default', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 2,
      })

      const bytes = await render(
        { ref: 'studio/home/hero', box: { width: 200, height: 100 } },
        'light',
        3,
      )

      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        600, 300,
      ])
    })

    it('refuses a render past the screenshot limit before opening a tab', async () => {
      const render = createWarmRenderer({
        baseUrl: () => host.url,
        browser: createWarmBrowser(async () => requireShell(shell)),
        scale: 2,
      })

      await expect(
        render(
          { ref: 'studio/home/hero', box: { width: 1440, height: 6000 } },
          'light',
          3,
        ),
      ).rejects.toMatchObject({ code: 'capture-too-large' })
    })
  },
)
