import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const BOARD = '/p/webapp/home'
const FRAMES = ['webapp/home/about', 'webapp/home/hero']

function frameRoot(page: Page, ref: string) {
  return page.frameLocator(`[data-frame="${ref}"] iframe`).locator('html')
}

/** Marks each frame's window, so a reload, which makes a new window, drops the mark. */
async function markFrames(page: Page): Promise<void> {
  for (const ref of FRAMES) {
    await frameRoot(page, ref).evaluate(() => {
      ;(window as { marked?: boolean }).marked = true
    })
  }
}

async function framesKeptTheirWindows(page: Page): Promise<boolean[]> {
  return Promise.all(
    FRAMES.map((ref) =>
      frameRoot(page, ref).evaluate(
        () => (window as { marked?: boolean }).marked === true,
      ),
    ),
  )
}

async function openThemeMenu(page: Page) {
  await page
    .getByRole('button', { name: /from git user\.name$|^Account$/ })
    .click()
  await page.getByRole('menuitem', { name: /^Theme/ }).hover()
}

test.describe('the board theme', () => {
  test.use({ colorScheme: 'light' })

  test('switches the chrome and every frame with no frame reload', async ({
    page,
  }) => {
    await page.goto(BOARD)
    for (const ref of FRAMES) {
      await expect(frameRoot(page, ref)).toHaveAttribute('data-theme', 'light')
    }
    await markFrames(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()

    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    for (const ref of FRAMES) {
      await expect(frameRoot(page, ref)).toHaveAttribute('data-theme', 'dark')
    }
    expect(await framesKeptTheirWindows(page)).toEqual([true, true])
  })

  test('keeps the chosen theme across a reload', async ({ page }) => {
    await page.goto(BOARD)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    await page.reload()

    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(frameRoot(page, 'webapp/home/hero')).toHaveAttribute(
      'data-theme',
      'dark',
    )
  })

  test('picks System, Light, and Dark from the avatar menu', async ({
    page,
  }) => {
    await page.goto(BOARD)
    await openThemeMenu(page)
    await expect(
      page.getByRole('menuitemradio', { name: 'System' }),
    ).toBeChecked()

    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(
      page.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeChecked()

    await page.getByRole('menuitemradio', { name: 'System' }).click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })

  test('switches from the home header', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Theme', exact: true }).click()

    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})

test.describe('serve --tokens', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    const brand = join(board.root, '../brand.css')
    writeFileSync(brand, ':root { --text: rgb(1, 2, 3) }')
    server = await serveBoard(board.root, ['--tokens', brand])
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test("reaches a frame's computed color", async ({ page }) => {
    await page.goto(`${server.url}${BOARD}`)

    await expect(
      page
        .frameLocator('[data-frame="webapp/home/hero"] iframe')
        .locator('body'),
    ).toHaveCSS('color', 'rgb(1, 2, 3)')
  })
})
