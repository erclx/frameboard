import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

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

  test('moves every project that does not override the token', async ({
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

    await page.goto(`${server.url}/p/marketing/launch`)
    await expect(page.frameLocator(LANDING).locator('h1')).toBeVisible()
    expect(await tokenIn(page, LANDING, '--space')).toBe('24px')
  })
})

test.describe('replacing a raw color with a token from Selection colors', () => {
  let board: FixtureBoard
  let server: BoardServer
  const path = () => join(board.root, 'webapp/home/hero.html')
  const read = () => readFileSync(path(), 'utf8')

  /** The hero with its headline and caption both set in raw indigo, one of them in rgb(). */
  // canon-allow-embedded: the frame this spec drives, kept beside the element names the test reads
  const RAW = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>hero</title></head>
  <body style="margin: 0; padding: var(--space); background: var(--surface)">
    <h1 data-name="Headline" style="color: #4f46e5">hero</h1>
    <p data-name="Caption" style="border: 1px solid rgb(79, 70, 229)">caption</p>
  </body>
</html>
`

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(path(), RAW)
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('rewrites every element using the color, and one undo puts them back', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const headline = page.frameLocator(HERO).locator('h1')
    await expect(headline).toBeVisible()
    // A click before the canvas fits lands beside the frame.
    await expect(async () => {
      await headline.click()
      await expect(
        page.getByRole('button', { name: 'Rename frame hero' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })

    await page
      .getByRole('button', { name: 'Replace 4f46e5 with a token' })
      .click()
    await page
      .getByRole('list', { name: 'Tokens to replace 4f46e5 with' })
      .getByRole('button', { name: /^primary/ })
      .click()

    await expect
      .poll(read)
      .toContain('<h1 data-name="Headline" style="color: var(--primary)">')
    expect(read()).toContain(
      '<p data-name="Caption" style="border: 1px solid var(--primary)">',
    )
    await expect(headline).toHaveCSS('color', 'rgb(79, 70, 229)')

    await undo(page)

    await expect.poll(read).toBe(RAW)
  })
})

test.describe('installing a font from the Theme tab', () => {
  // Stands in for Fontsource, answering one family from a bundled face's bytes.
  const STUB = pathToFileURL(resolve('e2e/support/fontsource-stub.mjs')).href
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root, [], {
      NODE_OPTIONS: `--import ${STUB}`,
    })
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('installs a found family and sets the headline in it', async ({
    page,
  }) => {
    const heroFile = join(board.root, 'webapp/home/hero.html')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const headline = page.frameLocator(HERO).locator('h1')
    await expect(headline).toBeVisible()
    await page.getByRole('tab', { name: 'Theme' }).click()

    await page.getByRole('button', { name: 'Find a font' }).click()
    await page.getByRole('searchbox').fill('stub')
    await page.getByRole('button', { name: 'Install Stub Display' }).click()

    await expect(
      page.getByRole('button', { name: 'Remove Stub Display' }),
    ).toBeVisible()

    // Retried, since the canvas refits once frames load and moves the headline.
    await expect(async () => {
      const box = await headline.boundingBox()
      if (!box) throw new Error('the headline has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.up('Meta')
      await expect(
        page.getByRole('button', { name: 'Font family' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Font family' }).click()
    await page.getByRole('menuitemradio', { name: 'Stub Display' }).click()

    await expect
      .poll(() => readFileSync(heroFile, 'utf8'))
      .toContain("font-family: 'Stub Display'")
    await expect
      .poll(
        () =>
          // `check` answers true for a family no face declares, so read the frame's own faces.
          headline.evaluate(() =>
            [...document.fonts].some(
              (face) =>
                face.family.replace(/["']/g, '') === 'Stub Display' &&
                face.status === 'loaded',
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe(true)
  })
})
