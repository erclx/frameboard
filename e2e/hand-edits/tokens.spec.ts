import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = '[data-frame="webapp/home/hero"] iframe'
const LANDING = '[data-frame="marketing/launch/landing"] iframe'

/** A custom property as the frame's root element computes it. */
function tokenIn(page: Page, frame: string, name: string) {
  return page
    .frameLocator(frame)
    .locator('html')
    .evaluate(
      (root, token) => getComputedStyle(root).getPropertyValue(token).trim(),
      name,
    )
}

test.describe('editing a board token on the Theme tab', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('moves every project that does not override the token and keeps the one that does', async ({
    page,
  }) => {
    const webappSheet = readFileSync(
      join(board.root, 'webapp/tokens.css'),
      'utf8',
    )
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await expect(page.frameLocator(HERO).locator('h1')).toBeVisible()
    await page.getByRole('tab', { name: 'Theme' }).click()

    const space = page.getByRole('textbox', { name: 'space value' })
    await space.fill('24')
    await space.press('Enter')

    await expect(page.frameLocator(HERO).locator('body')).toHaveCSS(
      'padding-top',
      '24px',
    )
    expect(readFileSync(join(board.root, 'tokens.css'), 'utf8')).toContain(
      '--space: 24px;',
    )
    expect(readFileSync(join(board.root, 'webapp/tokens.css'), 'utf8')).toBe(
      webappSheet,
    )
    expect(await tokenIn(page, HERO, '--accent')).toBe('#e11d48')

    await page.goto(`${server.url}/p/marketing/launch`)
    await expect(page.frameLocator(LANDING).locator('h1')).toBeVisible()
    expect(await tokenIn(page, LANDING, '--space')).toBe('24px')
  })
})
