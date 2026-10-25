import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = 'webapp/home/hero'
const ROW =
  '<div data-name="Row" style="display: flex; gap: 40px"><div data-name="One" style="width: 80px; height: 40px; background: var(--muted)"></div><div data-name="Two" style="width: 80px; height: 40px; background: var(--muted)"></div></div>'

test.describe('placing text and shapes into a frame', () => {
  let board: FixtureBoard
  let server: BoardServer

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    // A flex row under the headline, whose gap a shape lands in.
    writeFileSync(path(), read().replace('</h1>', `</h1>\n    ${ROW}`))
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** The hash of the bytes the hero's iframe shows, off the stamp the frame route puts on it. */
  const shownHash = (page: Page) =>
    hero(page).locator('style[data-frameboard]').getAttribute('data-hash')
  const tools = (page: Page) => page.getByRole('toolbar', { name: 'Tools' })
  const hero = (page: Page) =>
    page.frameLocator(`[data-frame="${HERO}"] iframe`)

  /** The screen point at the center of the hero's element matching `selector`. */
  async function centerOf(page: Page, selector: string) {
    const box = await hero(page).locator(selector).boundingBox()
    if (!box) throw new Error(`${selector} has no box on screen`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  test('a rectangle lands between two children of a row as one tag, is selected, and undoes', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const original = read()
    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')

    await tools(page).getByRole('button', { name: 'Rectangle' }).click()
    // In the 40px gap past the first child, on the row's own background.
    await page.mouse.click(one.x + one.width + 20, one.y + one.height / 2)

    await expect
      .poll(read)
      .toBe(
        original.replace(
          '<div data-name="Two"',
          '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div><div data-name="Two"',
        ),
      )
    await expect(
      tools(page).getByRole('button', { name: 'Rectangle' }),
    ).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-element-selection]')).toBeVisible()

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toBe(original)
  })

  test('a placed Text opens for typing, and a double-click on a selected text element edits it the same way', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const headline = await centerOf(page, 'h1')

    await tools(page).getByRole('button', { name: 'Text' }).click()
    // On the headline's lower half, so the Text lands between it and the row.
    await page.mouse.click(headline.x, headline.y + 8)
    await expect(hero(page).locator('[data-name="Text"]')).toBeFocused()
    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')

    await expect
      .poll(read)
      .toContain('</h1>\n    <p data-name="Text">Hello</p><div data-name="Row"')

    // The pick vouches only for bytes the frame shows, so it waits out the reload.
    await expect
      .poll(() => shownHash(page))
      .toBe(createHash('sha256').update(read()).digest('hex'))
    await page.keyboard.down('Meta')
    await page.mouse.click(headline.x, headline.y)
    await page.keyboard.up('Meta')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.mouse.dblclick(headline.x, headline.y)
    await expect(hero(page).locator('h1')).toBeFocused()
    await page.keyboard.type('Welcome')
    await page.keyboard.press('Enter')

    await expect.poll(read).toContain('<h1 data-name="Headline">Welcome</h1>')
  })
})
