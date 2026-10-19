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
