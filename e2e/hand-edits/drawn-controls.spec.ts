import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

const HERO = 'webapp/home/hero'

/** A photo whose CSS reads two custom properties, and a slider bound to each. */
const TUNER = readFileSync(
  join(import.meta.dirname, '../../test/fixtures/frames/photo-tuner.html'),
  'utf8',
)

test.describe('controls drawn in a frame', () => {
  let board: FixtureBoard
  let server: BoardServer

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')
  const hero = (page: Page) =>
    page.frameLocator(`[data-frame="${HERO}"] iframe`)
  const slider = (page: Page, name: string) =>
    hero(page).getByRole('slider', { name })
  const bar = (page: Page) =>
    page.getByRole('group', { name: 'Moved controls' })
  const photoProperty = (page: Page, property: string) =>
    hero(page)
      .locator('#photo')
      .evaluate(
        (photo, name) => (photo as HTMLElement).style.getPropertyValue(name),
        property,
      )

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(path(), TUNER)
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** Opens the page as a writer, enters Play, and enters the hero frame. */
  async function enterHero(page: Page) {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await expect(slider(page, 'Brightness')).toBeVisible()
    await page.getByRole('button', { name: 'Play' }).click()
    await hero(page).locator('#photo').click()
    await expect(page.getByText('In frame, Esc to leave')).toBeVisible()
  }

  test('a moved slider tunes live, Keep values writes one step, and one undo restores the file', async ({
    page,
  }) => {
    const original = read()
    await enterHero(page)

    await slider(page, 'Brightness').fill('130')
    await slider(page, 'Black and white').fill('60')
    await expect.poll(() => photoProperty(page, '--brightness')).toBe('130%')
    await expect(bar(page)).toContainText('2 values changed')
    expect(read()).toBe(original)
    await bar(page).getByRole('button', { name: 'Keep values' }).click()

    await expect
      .poll(read)
      .toContain('style="--brightness: 130%; --grayscale: 60%"')
    expect(read()).toContain(
      'value="130" data-binds="#photo --brightness" data-unit="%"',
    )
    expect(read()).toContain(
      'value="60" data-binds="#photo --grayscale" data-unit="%"',
    )
    await expect(bar(page)).toBeHidden()

    await undo(page)
    await expect.poll(read).toBe(original)
  })

  test('leaving Play without keeping puts the file values back', async ({
    page,
  }) => {
    const original = read()
    await enterHero(page)
    await slider(page, 'Brightness').fill('130')
    await expect(bar(page)).toContainText('1 value changed')

    await page.getByRole('button', { name: 'Edit' }).click()

    await expect(bar(page)).toBeHidden()
    await expect.poll(() => photoProperty(page, '--brightness')).toBe('')
    await expect(slider(page, 'Brightness')).toHaveValue('100')
    expect(read()).toBe(original)
  })

  test('Reset drops the moved values and writes nothing', async ({ page }) => {
    const original = read()
    await enterHero(page)
    await slider(page, 'Black and white').fill('60')

    await bar(page).getByRole('button', { name: 'Reset' }).click()

    await expect(bar(page)).toBeHidden()
    await expect.poll(() => photoProperty(page, '--grayscale')).toBe('')
    await expect(slider(page, 'Black and white')).toHaveValue('0')
    expect(read()).toBe(original)
  })

  test('a presented slide shows the design with its controls hidden', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/webapp/home`)
    await expect(slider(page, 'Brightness')).toBeVisible()

    await page.getByRole('button', { name: 'Present page' }).click()

    const slide = page
      .getByRole('dialog', { name: /^Presenting/ })
      .frameLocator('iframe')
    await expect(slide.locator('#photo')).toBeVisible()
    await expect(slide.getByRole('slider', { name: 'Brightness' })).toBeHidden()
    await expect(slide.getByText('Black and white')).toBeHidden()
  })
})

test.describe('a phone frame as tall as its page, entered in Play', () => {
  const ABOUT = 'webapp/home/about'
  let board: FixtureBoard
  let server: BoardServer

  const frame = (page: Page) => page.locator(`[data-frame="${ABOUT}"] iframe`)
  const scrollY = (page: Page) =>
    frame(page).evaluate(
      (element: HTMLIFrameElement) => element.contentWindow?.scrollY ?? -1,
    )
  const pageHeight = (page: Page) =>
    frame(page).evaluate((element: HTMLIFrameElement) => element.offsetHeight)

  /** Turns `about` into a phone frame 2454 tall, its page 2400 under the status bar. */
  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    const folder = join(board.root, 'webapp/home')
    const layout = JSON.parse(readFileSync(join(folder, 'layout.json'), 'utf8'))
    layout.frames.about = {
      ...layout.frames.about,
      height: 2454,
      showDevice: true,
    }
    writeFileSync(join(folder, 'layout.json'), JSON.stringify(layout))
    writeFileSync(
      join(folder, 'about.html'),
      TUNER.replace(
        '</body>',
        // Taller than the 2400 page, so a scroll left over at full length shows.
        '<div id="top" style="height:2600px">about</div></body>',
      ),
    )
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('shows one screen and scrolls its page under the wheel, and Edit shows it whole', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/webapp/home`)
    await expect(frame(page)).toBeVisible()
    await page.getByRole('button', { name: 'Play' }).click()
    await page
      .frameLocator(`[data-frame="${ABOUT}"] iframe`)
      .locator('#top')
      .click({ position: { x: 20, y: 20 } })
    await expect(page.getByText('In frame, Esc to leave')).toBeVisible()
    // The page stands under the 54 tall status bar on an 844 tall screen.
    await expect.poll(() => pageHeight(page)).toBe(790)

    await frame(page).hover()
    await page.mouse.wheel(0, 400)
    await expect.poll(() => scrollY(page)).toBeGreaterThan(0)

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect.poll(() => pageHeight(page)).toBe(2400)
    await expect.poll(() => scrollY(page)).toBe(0)
  })

  test('puts Keep values inside the phone it shows, not the stored box below it', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await expect(frame(page)).toBeVisible()
    await page.getByRole('button', { name: 'Play' }).click()
    const tuner = page.frameLocator(`[data-frame="${ABOUT}"] iframe`)
    await tuner.locator('#photo').click()
    await expect(page.getByText('In frame, Esc to leave')).toBeVisible()

    await tuner.getByRole('slider', { name: 'Brightness' }).fill('130')

    const keep = page.getByRole('group', { name: 'Moved controls' })
    await expect(keep).toContainText('1 value changed')
    const shown = await frame(page).boundingBox()
    const placed = await keep.boundingBox()
    expect(shown).not.toBeNull()
    expect(placed).not.toBeNull()
    expect((placed?.y ?? 0) + (placed?.height ?? 0)).toBeLessThanOrEqual(
      (shown?.y ?? 0) + (shown?.height ?? 0),
    )
  })
})
