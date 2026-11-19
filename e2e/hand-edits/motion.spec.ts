import { copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = 'studio/home/hero'
// A red box sliding 800 px right over 4 s, so its left edge names the moment.
const SLIDE = join(import.meta.dirname, '../../test/fixtures/frames/slide.html')

test.describe("scrubbing a frame's motion", () => {
  // Motion on, since the page under test may read reduced motion.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  let board: FixtureBoard
  let server: BoardServer

  const files = () =>
    ['studio/home/hero.html', 'studio/home/layout.json'].map((file) =>
      readFileSync(join(board.root, file), 'utf8'),
    )
  const boxLeft = (page: Page) =>
    page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('#box')
      .evaluate((box) => Math.round(box.getBoundingClientRect().left))

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('live')
    copyFileSync(SLIDE, join(board.root, `${HERO}.html`))
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('holds the frame mid-slide, plays it on, and exports a filmstrip, writing nothing', async ({
    page,
  }) => {
    const before = files()
    const frame = page.locator(`[data-frame="${HERO}"]`)
    // A click before the canvas fits lands beside the frame, so it retries.
    await expect(async () => {
      const box = await frame.boundingBox()
      if (!box) throw new Error('The hero has no box on screen')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByRole('heading', { name: 'Motion' })).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })

    const track = page.getByRole('slider', { name: 'Position' })
    // The inspector scrolls, and the Frame section above can push Motion past its foot.
    await track.scrollIntoViewIfNeeded()
    const bounds = await track.boundingBox()
    if (!bounds) throw new Error('The track has no box on screen')
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    )
    await expect(
      page.getByRole('button', { name: /^Held at 2\.\d\d s/ }),
    ).toBeVisible()
    // The seek lands a frame or two after the chip shows, so the read settles on it.
    await expect
      .poll(async () => Math.abs((await boxLeft(page)) - 400))
      .toBeLessThan(100)
    const held = await boxLeft(page)

    const motion = page.getByRole('region', { name: 'Motion' })
    await motion.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => boxLeft(page)).not.toBe(held)
    await motion.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('button', { name: /^Held at/ })).toBeVisible()

    await page.getByRole('tab', { name: 'Export' }).click()
    await page.getByRole('button', { name: 'Export scale' }).click()
    await page.getByRole('menuitemradio', { name: '1x' }).click()
    await page.getByRole('button', { name: 'Export theme' }).click()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export filmstrip' }).click()
    const download = await downloading

    expect(download.suggestedFilename()).toBe('hero.filmstrip-5.light@1x.png')
    const bytes = readFileSync(await download.path())
    // IHDR width and height: five 1440 by 900 frames, 40 px around and between.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      7440, 980,
    ])
    expect(files()).toEqual(before)
  })
})

test.describe("a slide's speaker notes", () => {
  let board: FixtureBoard
  let server: BoardServer

  const entry = () =>
    JSON.parse(
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
    ).frames.hero

  const selectHero = async (page: Page) => {
    const frame = page.locator(`[data-frame="${HERO}"]`)
    // A click before the canvas fits lands beside the frame, so it retries.
    await expect(async () => {
      const box = await frame.boundingBox()
      if (!box) throw new Error('The hero has no box on screen')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(frame).toHaveAttribute('data-selected', 'true', {
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })
  }

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('keeps a note typed under a slide across a reload, and one undo removes it', async ({
    page,
  }) => {
    const frameFile = readFileSync(join(board.root, `${HERO}.html`), 'utf8')
    await selectHero(page)
    await page.getByRole('tab', { name: 'Slides' }).click()
    await page.getByRole('button', { name: 'Notes hidden' }).click()

    const notes = page
      .locator(`[data-speaker-notes="${HERO}"]`)
      .getByRole('textbox', { name: 'Speaker notes' })
    await notes.fill('Open on the price.\nThen the demo.')
    await notes.press('ControlOrMeta+Enter')
    await expect
      .poll(() => entry().speakerNotes)
      .toBe('Open on the price.\nThen the demo.')

    await page.reload()
    await selectHero(page)
    await expect(notes).toHaveValue('Open on the price.\nThen the demo.')

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => entry()).not.toHaveProperty('speakerNotes')
    expect(readFileSync(join(board.root, `${HERO}.html`), 'utf8')).toBe(
      frameFile,
    )
  })

  test('shows every slide its strip from one button, kept across a reload, and hides them all', async ({
    page,
  }) => {
    // Counted by element, since a narrow frame's strip hides its field below 200 px on screen.
    const strips = page.locator('[data-speaker-notes]')
    await selectHero(page)
    await page.getByRole('tab', { name: 'Slides' }).click()

    await page.getByRole('button', { name: 'Notes hidden' }).click()
    await expect(strips).toHaveCount(2)

    await page.reload()
    await selectHero(page)
    await page.getByRole('tab', { name: 'Slides' }).click()
    await expect(strips).toHaveCount(2)

    await page
      .getByRole('button', { name: 'Notes shown', pressed: true })
      .click()
    await expect(strips).toHaveCount(0)
  })
})

test.describe("a slide's effects picked from tiles", () => {
  const WEBAPP_HERO = 'webapp/home/hero'

  let board: FixtureBoard
  let server: BoardServer

  const heroFile = () =>
    readFileSync(join(board.root, `${WEBAPP_HERO}.html`), 'utf8')
  const present = () =>
    JSON.parse(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    ).present

  /** Cmd-clicks the hero's headline and opens the Slides tab on it. */
  async function selectHeadline(page: Page): Promise<void> {
    const headline = page
      .frameLocator(`[data-frame="${WEBAPP_HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // Retried, since the canvas refits once frames load and moves the headline.
    await expect(async () => {
      const box = await headline.boundingBox()
      if (!box) throw new Error('the headline has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.up('Meta')
      await expect(
        page.getByRole('heading', { name: 'Appearance' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    await page.getByRole('tab', { name: 'Slides' }).click()
  }

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('keeps a step effect and a page transition picked from tiles across a reload', async ({
    page,
  }) => {
    await selectHeadline(page)
    const step = page.getByRole('textbox', { name: 'Appears on step' })
    await step.fill('1')
    await step.press('Enter')
    await expect.poll(heroFile).toContain('data-step="1"')

    const effects = page.getByRole('radiogroup', { name: 'Effect' })
    await effects.getByRole('radio', { name: 'Fly' }).click()
    await expect.poll(heroFile).toContain('data-step-effect="fly"')

    const transitions = page.getByRole('radiogroup', {
      name: 'Slide transition',
    })
    await transitions.getByRole('radio', { name: 'Push' }).click()
    await expect.poll(() => present()?.transition?.name).toBe('push')

    await page.reload()
    await selectHeadline(page)

    await expect(effects.getByRole('radio', { name: 'Fly' })).toBeChecked()
    await expect(transitions.getByRole('radio', { name: 'Push' })).toBeChecked()
  })
})
