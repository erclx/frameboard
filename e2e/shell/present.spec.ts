import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const BOARD = '/p/webapp/home'
const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

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
    // The board's tooltips open with no delay, so one the returned focus
    // opened would already show once that focus has landed.
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)
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

test.describe('a deck with a transition and a stepped slide', () => {
  /**
   * The page fades between slides, `about` holds two steps, and a third
   * frame `closing` sits past it on the row, so the deck reads hero, about,
   * closing.
   */
  test.beforeEach(() => {
    const page = join(board.root, 'webapp/home')
    const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
    layout.present = { transition: { name: 'fade', ms: 200 } }
    layout.frames.closing = {
      x: 3000,
      y: 0,
      width: 390,
      height: 844,
      order: 3,
    }
    writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))
    writeFileSync(
      join(page, 'about.html'),
      '<!doctype html><title>about</title><h1>about</h1>' +
        '<p id="one" data-step="1">One</p>' +
        '<p id="two" data-step="2" data-step-effect="fade">Two</p>',
    )
    writeFileSync(
      join(page, 'closing.html'),
      '<!doctype html><title>closing</title><p>closing</p>',
    )
  })

  const arriving = (page: Page) =>
    presenting(page).locator('[data-present-layer="enter"] iframe')
  const step = (page: Page, id: string) =>
    arriving(page).contentFrame().locator(`#${id}`)

  test('reveals the stepped slide one press at a time and shows every step in Edit', async ({
    page,
  }) => {
    await open(page)
    const onCanvas = page
      .locator('[data-frame="webapp/home/about"] iframe')
      .contentFrame()
    await expect(onCanvas.locator('#two')).toBeVisible()
    await page.keyboard.press('Shift+P')
    await expect(arriving(page)).toHaveAttribute('title', 'hero')

    await page.keyboard.press('ArrowRight')
    await expect(arriving(page)).toHaveAttribute('title', 'about')
    await expect(
      bar(page).getByRole('img', { name: 'Step 0 of 2' }),
    ).toBeAttached()
    await expect(step(page, 'one')).toBeHidden()

    await page.keyboard.press('ArrowRight')
    await expect(step(page, 'one')).toBeVisible()
    await expect(step(page, 'two')).toBeHidden()
    await page.keyboard.press('ArrowRight')
    await expect(step(page, 'two')).toBeVisible()
    await expect(arriving(page)).toHaveAttribute('title', 'about')

    await page.keyboard.press('ArrowRight')

    await expect(arriving(page)).toHaveAttribute('title', 'closing')
    await expect(bar(page)).toContainText('3 / 3')
  })
})

test.describe("a transition of the project's own", () => {
  // The suite runs with motion reduced, which cuts every transition.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('plays the keyframes of a file an agent wrote and set by name', async ({
    page,
  }) => {
    const folder = join(board.root, 'webapp/assets/transitions')
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, 'wipe.css'),
      '@keyframes enter { from { clip-path: inset(0 0 0 100%) } to { clip-path: inset(0) } }',
    )
    await run('node', [
      CLI,
      'page',
      'transition',
      'webapp/home',
      'wipe',
      '--ms',
      '4000',
      '--root',
      board.root,
      '--json',
    ])
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(page.locator('style[data-own-transitions]')).toBeAttached()

    await page.keyboard.press('ArrowRight')

    const arriving = presenting(page).locator('[data-present-layer="enter"]')
    await expect(arriving).toHaveAttribute('data-transition', 'wipe')
    await expect(arriving).toHaveCSS(
      'animation-name',
      'fb-own-webapp--wipe-enter',
    )
    expect(
      await arriving.evaluate((layer) => layer.getAnimations().length),
    ).toBe(1)
  })
})
