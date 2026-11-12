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
  // The test plays the frame's animation, which reduced motion would not stop
  // but the page under test may read, so it runs with motion on.
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

    await page.getByRole('button', { name: 'Export scale' }).click()
    await page.getByRole('menuitemradio', { name: '1x' }).click()
    await page.getByRole('button', { name: 'Export theme' }).click()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export filmstrip' }).click()
    const download = await downloading

    expect(download.suggestedFilename()).toBe('hero.filmstrip-5.light@1x.png')
    const bytes = readFileSync(await download.path())
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20: five
    // 1440 by 900 frames in a row, 40 px around and between them.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      7440, 980,
    ])
    expect(files()).toEqual(before)
  })
})
