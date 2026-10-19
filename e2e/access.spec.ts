import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

/** Posts to the show route from the page itself, the way a board control would. */
function show(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/show', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: 'studio/home/hero' }),
    })
    return response.status
  })
}

test.describe('the board write key', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('a page opened through a ticket URL can write', async ({ page }) => {
    await page.goto(await server.ticketUrl())

    await expect(page).toHaveURL(`${server.url}/`)
    expect(await show(page)).toBe(200)
  })

  test('a fresh context on the plain URL cannot write', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(server.url)

    expect(await show(page)).toBe(401)
    await context.close()
  })

  test('a second page on a used ticket gets no cookie', async ({
    browser,
    page,
  }) => {
    const ticket = await server.ticketUrl()
    await page.goto(ticket)
    const other = await browser.newContext()
    const second = await other.newPage()

    await second.goto(ticket)

    await expect(second).toHaveURL(`${server.url}/`)
    expect(await show(second)).toBe(401)
    await other.close()
  })

  test('the cookie is HttpOnly, so a script cannot read it', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())

    expect(await page.evaluate(() => document.cookie)).toBe('')
    const cookies = await page.context().cookies()
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Strict' })
  })
})
