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

/** A deck reading hero, then about with two steps, each slide holding a speaker note. */
test.beforeEach(async () => {
  board = copyFixtureBoard('basic')
  const page = join(board.root, 'webapp/home')
  const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
  layout.frames.hero.speakerNotes = 'Open on the problem.'
  layout.frames.about.speakerNotes = 'Then fold it live.'
  writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))
  writeFileSync(
    join(page, 'about.html'),
    '<!doctype html><title>about</title><h1>about</h1>' +
      '<p id="one" data-step="1">One</p><p id="two" data-step="2">Two</p>',
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
const nowSlide = (presenter: Page) =>
  presenter.getByRole('region', { name: 'Now' }).locator('iframe')

/** Opens the board and presents with the presenter view, answering the window it opens. */
async function presentWithPresenter(page: Page): Promise<Page> {
  await page.goto(`${server.url}${BOARD}`)
  await expect(
    page.locator('[data-frame="webapp/home/hero"] iframe'),
  ).toBeVisible()
  const popup = page.waitForEvent('popup')
  await page.keyboard.press('Alt+Shift+P')
  const presenter = await popup
  await expect(nowSlide(presenter)).toHaveAttribute('title', 'hero')
  return presenter
}

test.describe('a phone slide turned from the present bar', () => {
  /** Shows `about` in its phone, a fixed 390 by 844 screen. */
  test.beforeEach(async () => {
    const folder = join(board.root, 'webapp/home')
    const layout = JSON.parse(readFileSync(join(folder, 'layout.json'), 'utf8'))
    layout.frames.about = { ...layout.frames.about, showDevice: true }
    writeFileSync(join(folder, 'layout.json'), JSON.stringify(layout))
    await server.stop()
    server = await serveBoard(board.root)
  })

  test('turns the shown phone landscape and the presenter view follows', async ({
    page,
  }) => {
    // Turning writes the layout, which only a tab holding the access cookie may.
    await page.goto(await server.ticketUrl())
    const presenter = await presentWithPresenter(page)
    await presenter.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    const size = (frame: ReturnType<typeof shown>) =>
      frame.evaluate((element: HTMLIFrameElement) => [
        element.offsetWidth,
        element.offsetHeight,
      ])
    // Upright, the page stands under the 54 tall status bar.
    await expect.poll(() => size(shown(page))).toEqual([390, 790])

    await page.mouse.move(10, 10)
    await page
      .getByRole('toolbar', { name: 'Presenting' })
      .getByRole('button', { name: 'Rotate' })
      .click()

    // Turned, the page stands 54 in from each short side, clear of the island.
    await expect.poll(() => size(shown(page))).toEqual([736, 390])
    await expect.poll(() => size(nowSlide(presenter))).toEqual([736, 390])
  })
})

test.describe('the presenter view', () => {
  test('steps the audience from its own keys and closes when the audience leaves', async ({
    page,
  }) => {
    const presenter = await presentWithPresenter(page)
    await expect(shown(page)).toHaveAttribute('title', 'hero')
    await expect(
      presenter.getByRole('region', { name: 'Speaker notes' }),
    ).toContainText('Open on the problem.')

    await presenter.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    // A press before the audience counts the slide's steps would step past them.
    await expect(
      page
        .getByRole('toolbar', { name: 'Presenting' })
        .getByRole('img', { name: 'Step 0 of 2' }),
    ).toBeAttached()
    await presenter.keyboard.press('ArrowRight')

    await expect(shown(page).contentFrame().locator('#one')).toBeVisible()
    await expect(shown(page).contentFrame().locator('#two')).toBeHidden()
    await expect(
      presenter.getByRole('img', { name: 'Step 1 of 2' }),
    ).toBeAttached()
    await expect(nowSlide(presenter)).toHaveAttribute('title', 'about')

    const closed = presenter.waitForEvent('close')
    await page.keyboard.press('Escape')

    await expect(presenting(page)).toHaveCount(0)
    await closed
  })

  test('takes the audience full screen on F and from the bar once it is open', async ({
    page,
  }) => {
    await presentWithPresenter(page)
    const fullscreen = () => page.evaluate(() => !!document.fullscreenElement)

    await page.keyboard.press('f')
    await expect.poll(fullscreen).toBe(true)
    await page.keyboard.press('f')
    await expect.poll(fullscreen).toBe(false)

    await page
      .getByRole('toolbar', { name: 'Presenting' })
      .getByRole('button', { name: 'Full screen' })
      .click()

    await expect.poll(fullscreen).toBe(true)
    await expect(presenting(page)).toBeVisible()
  })
})
