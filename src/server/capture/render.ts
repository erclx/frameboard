import type { Browser, Page } from 'playwright-core'

import { frameUrl } from '@/shared/board-urls'

import { assertFontsPresent } from './fonts'

export type Theme = 'light' | 'dark'

export const THEMES: readonly Theme[] = ['light', 'dark']

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
}

export interface OpenFrame {
  page: Page
  close: () => Promise<void>
}

/**
 * Loads a frame in its own browser context at its layout size, in the theme
 * asked for, and resolves once it has loaded and every face it asks for is
 * present. A missing face refuses `font-missing` and closes the context.
 */
export async function openFrame(
  browser: Browser,
  { baseUrl, ref, box, theme, scale = 1 }: OpenFrameOptions,
): Promise<OpenFrame> {
  const context = await browser.newContext({
    viewport: { width: box.width, height: box.height },
    deviceScaleFactor: scale,
    colorScheme: theme,
  })
  const close = () => context.close()
  try {
    const page = await context.newPage()
    await page.addInitScript(setThemeOnLoad, theme)
    await page.goto(new URL(frameUrl(ref), baseUrl).href, {
      timeout: LOAD_TIMEOUT_MS,
    })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await assertFontsPresent(page, ref)
    return { page, close }
  } catch (error) {
    await close()
    throw error
  }
}

// The attributes the board sets on a frame's root, set once `<html>` exists.
function setThemeOnLoad(theme: Theme): void {
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  })
}

/** Renders a frame to PNG bytes in a theme, as the server's PNG route asks. */
export type RenderFrame = (
  frame: { ref: string; box: { width: number; height: number } },
  theme: Theme,
) => Promise<Buffer>

export interface WarmRenderer {
  render: RenderFrame
  /** Closes the browser, including one still launching, so no Chromium outlives the server. */
  close: () => Promise<void>
}

/**
 * One browser kept warm for a server, launched on the first render and
 * reused after, rendering one frame at a time at twice its size. A launch
 * that fails is not kept, so a browser installed later is found on the next
 * render.
 */
export function createWarmRenderer({
  baseUrl,
  launch,
}: {
  /** Read per render, since the server's port is known only once listening. */
  baseUrl: () => string
  launch: () => Promise<Browser>
}): WarmRenderer {
  let browser: Promise<Browser> | null = null
  let closed = false
  // Renders run in turn, so a frame calling the route in a loop costs one tab.
  let queue: Promise<unknown> = Promise.resolve()

  const warm = (): Promise<Browser> => {
    browser ??= launch().catch((error: unknown) => {
      browser = null
      throw error
    })
    return browser
  }

  const render: RenderFrame = (frame, theme) => {
    const run = queue.then(async () => {
      if (closed) throw new Error('The board server is closing.')
      const opened = await openFrame(await warm(), {
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

  return {
    render,
    close: async () => {
      closed = true
      const launched = browser
      browser = null
      await launched?.then((open) => open.close()).catch(() => {})
    },
  }
}
