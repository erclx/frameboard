import type { Locator, Page } from '@playwright/test'

/**
 * The canvas on screen. A page switch keeps the page it left mounted and
 * hidden, so an unscoped read can resolve to two canvases.
 */
export function liveCanvas(page: Page): Locator {
  return page.locator('[data-canvas]:visible')
}

/**
 * The pan and zoom layer inside the canvas on screen. It is scoped through the
 * canvas rather than `:visible`, since the layer holds only absolute children
 * and draws no box of its own.
 */
export function liveLayer(page: Page): Locator {
  return liveCanvas(page).locator('[data-layer]')
}
