import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const BOARD = '/p/webapp/home'

let board: FixtureBoard
let server: BoardServer

/**
 * `hero` sits at x 0 and `about` at x 1520 on one row, and a hidden `draft`
 * sits past both, so the page presents `hero` then `about`.
 */
test.beforeEach(async () => {
  board = copyFixtureBoard('basic')
  const page = join(board.root, 'webapp/home')
  const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
  layout.frames.draft = {
    x: 2000,
    y: 0,
    width: 390,
    height: 844,
    order: 2,
    hidden: true,
    locked: false,
  }
  writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))
  writeFileSync(
    join(page, 'draft.html'),
    '<!doctype html><title>draft</title><p>draft</p>',
  )
  server = await serveBoard(board.root)
})

test.afterEach(async () => {
  await server.stop()
  board.cleanup()
})

const presenting = (page: Page) =>
  page.getByRole('dialog', { name: /^Presenting/ })
const shown = (page: Page) => presenting(page).locator('iframe')
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Presenting' })

async function open(page: Page) {
  await page.goto(`${server.url}${BOARD}`)
  await expect(
    page.locator('[data-frame="webapp/home/hero"] iframe'),
  ).toBeVisible()
}

test.describe('presenting a page', () => {
  test('steps by key and leaves on Esc with the frame selected', async ({
    page,
  }) => {
    await open(page)

    await page.getByRole('button', { name: 'Present page' }).click()
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await page.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await page.keyboard.press('Space')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await expect(bar(page)).toContainText('2 / 2')

    await page.keyboard.press('Escape')

    await expect(presenting(page)).toHaveCount(0)
    await expect(
      page.locator('[data-frame="webapp/home/about"][data-selected]'),
    ).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: 'Present page' }),
    ).toBeFocused()
  })

  test('steps and leaves from the bar a pointer move shows', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await page.mouse.move(200, 200)
    await page.mouse.move(220, 210)
    await bar(page).getByRole('button', { name: 'Next frame' }).click()
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await bar(page).getByRole('button', { name: 'Leave presenting' }).click()

    await expect(presenting(page)).toHaveCount(0)
  })

  test('steps by key with focus inside the presented frame', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await shown(page).click()
    await page.keyboard.press('ArrowRight')

    await expect(shown(page)).toHaveAttribute('title', 'about')
  })

  test('keeps the board keys from the board while presenting', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(presenting(page)).toBeVisible()
    // Off the overlay, where the registry's own dialog skip no longer covers the press.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })

    await page.keyboard.press('ControlOrMeta+k')

    await expect(
      page.getByRole('dialog', { name: 'Command palette' }),
    ).toHaveCount(0)
  })
})
