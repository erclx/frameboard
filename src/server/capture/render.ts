import type { Browser, Page } from 'playwright-core'

import { frameThemeUrl, type Theme } from '@/shared/theme'

import { assertFontsPresent } from './fonts'

/** How long a frame has to load before its capture fails. */
const LOAD_TIMEOUT_MS = 10_000

export interface OpenFrameOptions {
  /** The origin serving `/frames/`, a frame host or the board server. */
  baseUrl: string
  ref: string
  /** The viewport, being the frame's layout size. */
  box: { width: number; height: number }
  theme: Theme
  /** Device pixels per CSS pixel, 1 for a capture. */
  scale?: number
  /**
   * `require` refuses a frame whose face is missing, so a capture never shows
   * a fallback as the design. `wait` loads it in the fallback the board shows,
   * for a reading of what the board renders.
   */
  fonts?: 'require' | 'wait'
}

export interface OpenFrame {
  page: Page
  close: () => Promise<void>
}

/**
 * Loads a frame in its own browser context at its layout size, in the theme
 * asked for, and resolves once it has loaded and its faces have settled.
 * Under `fonts: 'require'`, the default, a missing face refuses
 * `font-missing` and closes the context.
 */
export async function openFrame(
  browser: Browser,
  { baseUrl, ref, box, theme, scale = 1, fonts = 'require' }: OpenFrameOptions,
): Promise<OpenFrame> {
  const context = await browser.newContext({
    viewport: { width: box.width, height: box.height },
    deviceScaleFactor: scale,
    colorScheme: theme,
  })
  const close = () => context.close()
  try {
    const page = await context.newPage()
    // The frame route's injected script sets the root's theme from the URL.
    await page.goto(new URL(frameThemeUrl(ref, theme), baseUrl).href, {
      timeout: LOAD_TIMEOUT_MS,
    })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (fonts === 'require') await assertFontsPresent(page, ref)
    return { page, close }
  } catch (error) {
    await close()
    throw error
  }
}

/** Renders a frame to PNG bytes in a theme, as the server's PNG route asks. */
export type RenderFrame = (
  frame: { ref: string; box: { width: number; height: number } },
  theme: Theme,
) => Promise<Buffer>

export interface WarmBrowser {
  /** The browser, launched on the first call and reused after. */
  get: () => Promise<Browser>
  /** Closes the browser, including one still launching, so no Chromium outlives the server. */
  close: () => Promise<void>
}

/**
 * One browser kept warm for a server and shared by everything rendering on
 * it, so the server holds one Chromium. A launch that fails is not kept, so a
 * browser installed later is found on the next call, and every call after
 * `close` refuses.
 */
export function createWarmBrowser(launch: () => Promise<Browser>): WarmBrowser {
  let browser: Promise<Browser> | null = null
  let closed = false

  return {
    get: () => {
      if (closed)
        return Promise.reject(new Error('The board server is closing.'))
      browser ??= launch().catch((error: unknown) => {
        browser = null
        throw error
      })
      return browser
    },
    close: async () => {
      closed = true
      const launched = browser
      browser = null
      await launched?.then((open) => open.close()).catch(() => {})
    },
  }
}

/**
 * Renders on a server's warm browser one frame at a time at twice its size.
 * The queue is the renderer's own, so a PNG never waits behind another
 * consumer of the browser.
 */
export function createWarmRenderer({
  baseUrl,
  browser,
}: {
  /** Read per render, since the server's port is known only once listening. */
  baseUrl: () => string
  browser: WarmBrowser
}): RenderFrame {
  // Renders run in turn, so a frame calling the route in a loop costs one tab.
  let queue: Promise<unknown> = Promise.resolve()

  return (frame, theme) => {
    const run = queue.then(async () => {
      const opened = await openFrame(await browser.get(), {
        baseUrl: baseUrl(),
        ref: frame.ref,
        box: frame.box,
        theme,
        scale: 2,
      })
      try {
        return await opened.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
        })
      } finally {
        await opened.close()
      }
    })
    queue = run.catch(() => {})
    return run
  }
}
