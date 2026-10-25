import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

test.describe('the board', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    // A frame far from the rest, so fitting the page leaves the others far
    // offscreen once zoomed in, and near enough that the fit between both
    // panels stays above the 0.02 zoom floor.
    writeFileSync(
      join(board.root, 'studio/pricing/layout.json'),
      JSON.stringify({
        version: 1,
        frames: {
          plans: { x: 0, y: 0, width: 1440, height: 900, order: 0 },
          faq: { x: 30000, y: 0, width: 1440, height: 900, order: 1 },
        },
      }),
    )
    writeFileSync(
      join(board.root, 'studio/pricing/faq.html'),
      '<!doctype html><title>faq</title><p>faq</p>',
    )
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('opens a project from home, switches pages, and returns home', async ({
    page,
  }) => {
    await page.goto(server.url)
    await page.getByRole('link', { name: /studio/ }).click()

    await expect(page).toHaveURL(/\/p\/studio\/home$/)
    await expect(page.locator('[data-frame]')).toHaveCount(2)

    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'pricing' })
      .click()
    await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
    await expect(
      page.locator('[data-frame="studio/pricing/plans"]'),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })

  test("loads a frame's page stylesheet and project asset", async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/studio/home`)
    const hero = page.frameLocator('iframe[title="hero"]')

    await expect(hero.getByRole('heading')).toHaveCSS(
      'color',
      'rgb(20, 90, 60)',
    )
    await expect
      .poll(() =>
        hero
          .getByRole('img', { name: 'dot' })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0)
  })

  test('finds copy on another page and selects the element holding it', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/studio/home`)
    await expect(page.locator('[data-frame]')).toHaveCount(2)

    await page.keyboard.press('ControlOrMeta+f')
    await page.getByRole('combobox', { name: 'Find in studio' }).fill('plans')
    await page.getByRole('option', { name: /^Text in plans/ }).click()

    await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
    await expect(page.locator('[data-element-selection]')).toBeVisible()
  })

  test('holds no live page for a frame far offscreen', async ({ page }) => {
    await page.goto(`${server.url}/p/studio/pricing`)
    const canvas = page.locator('[data-canvas]')
    await expect(page.locator('[data-frame]')).toHaveCount(2)

    // Zoom in on the plans frame, leaving faq dozens of viewports away.
    const plans = await page
      .locator('[data-frame="studio/pricing/plans"]')
      .boundingBox()
    if (!plans) throw new Error('plans frame has no box')
    await page.mouse.move(plans.x + plans.width / 2, plans.y + plans.height / 2)
    await pinch(page, -1500)

    await expect(
      page.locator('[data-frame="studio/pricing/faq"] iframe'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-frame="studio/pricing/plans"] iframe'),
    ).toHaveCount(1)
    await expect(canvas).toBeVisible()
  })
})

/**
 * A trackpad pinch of `deltaY` in all, sent as the small Ctrl wheels a
 * trackpad sends, since one large wheel reads as a mouse notch and steps once.
 */
async function pinch(page: Page, deltaY: number): Promise<void> {
  const parts = Math.ceil(Math.abs(deltaY) / 25)
  await page.keyboard.down('Control')
  for (let sent = 0; sent < parts; sent++) {
    await page.mouse.wheel(0, deltaY / parts)
  }
  await page.keyboard.up('Control')
}
