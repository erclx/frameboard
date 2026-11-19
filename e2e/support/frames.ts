import type { Frame, Page } from '@playwright/test'

/**
 * The page inside each iframe `selector` matches, in document order, null for
 * one showing none. Read through Playwright, since a frame on its own port
 * hides its document from the board's page.
 */
export async function framePages(
  page: Page,
  selector = 'iframe',
): Promise<(Frame | null)[]> {
  const handles = await page.locator(selector).elementHandles()
  return Promise.all(handles.map((handle) => handle.contentFrame()))
}

/**
 * Whether at least one iframe matches `selector` and each shows a parsed page,
 * false while one is mid-navigation rather than an error.
 */
export async function framesLoaded(
  page: Page,
  selector = 'iframe',
): Promise<boolean> {
  const frames = await framePages(page, selector)
  if (frames.length === 0) return false
  const ready = await Promise.all(
    frames.map((frame) =>
      frame
        ?.evaluate(
          () => document.readyState === 'complete' && document.body !== null,
        )
        .catch(() => false),
    ),
  )
  return ready.every(Boolean)
}
