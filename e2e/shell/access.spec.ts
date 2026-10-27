import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

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

    expect(await show(second)).toBe(401)
    await other.close()
  })

  test('a plain-URL tab says it reads and names the fix', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(server.url)

    await expect(
      page.getByRole('status').filter({ hasText: 'View only' }),
    ).toHaveText('View only. Run frameboard open to edit')
    await context.close()
  })

  test('a used ticket lands with a toast that stays and a clean address', async ({
    browser,
    page,
  }) => {
    const ticket = await server.ticketUrl()
    await page.goto(ticket)
    const other = await browser.newContext()
    const second = await other.newPage()

    await second.goto(ticket)

    await expect(second.getByText('This edit link has expired')).toBeVisible()
    await expect(second).toHaveURL(`${server.url}/`)
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

test.describe('a note card in a read-only tab', () => {
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

  /** Saves a note on the hero frame from a writing tab and answers it 8 times at about 800 characters each. */
  async function longThreadOnHero(page: Page): Promise<void> {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    const hero = page.locator('[data-frame="studio/home/hero"]')
    await expect(hero.locator('iframe')).toBeVisible()
    await page.getByRole('button', { name: 'Note', exact: true }).click()
    const box = await hero.boundingBox()
    if (!box) throw new Error('the hero frame has no box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const composer = page.getByRole('region', { name: 'New note on hero' })
    await composer.getByRole('textbox').fill('Rewrite the hero copy')
    await composer.getByRole('button', { name: 'Save' }).click()
    await expect(composer).toHaveCount(0)
    const { stdout } = await run('node', [
      CLI,
      'notes',
      '--json',
      '--root',
      board.root,
    ])
    const [note] = (JSON.parse(stdout) as { data: { notes: { id: string }[] } })
      .data.notes
    if (!note) throw new Error('the saved note is not listed')
    const body = 'The hero copy now leads with the outcome. '.repeat(19)
    for (let turn = 1; turn <= 8; turn++) {
      await run('node', [
        CLI,
        'notes',
        'reply',
        note.id,
        `${turn}. ${body}`,
        '--root',
        board.root,
      ])
    }
  }

  test('starts a capped card below the View only pill', async ({
    browser,
    page,
  }) => {
    await longThreadOnHero(page)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    const reader = await context.newPage()
    await reader.goto(`${server.url}/p/studio/home`)
    const pill = reader.getByRole('status').filter({ hasText: 'View only' })
    await expect(pill).toBeVisible()

    await reader.getByRole('button', { name: /^Note \d+ on hero$/ }).click()

    const thread = reader.getByRole('region', { name: /^Note \d+$/ })
    await expect(
      thread.getByRole('list', { name: 'Messages' }).getByRole('listitem'),
    ).toHaveCount(9)
    await expect
      .poll(async () => {
        const [card, notice] = await Promise.all([
          thread.boundingBox(),
          pill.boundingBox(),
        ])
        if (!card || !notice) throw new Error('the card or the pill has no box')
        return card.y - (notice.y + notice.height)
      })
      .toBeGreaterThanOrEqual(0)
    await expect(thread.getByRole('heading')).toBeInViewport()
    await context.close()
  })
})
