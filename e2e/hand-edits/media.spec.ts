import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

test.describe('video and audio placed by hand', () => {
  let board: FixtureBoard
  let server: BoardServer

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')
  const tools = (page: Page) => page.getByRole('toolbar', { name: 'Tools' })
  const hero = (page: Page) =>
    page.frameLocator(`[data-frame="${HERO}"] iframe`)

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(path(), read().replace('</h1>', `</h1>\n    ${ROW}`))
    // A one second VP8 clip the browser decodes, and an audio file whose
    // bytes it need not, since placing audio measures nothing.
    const assets = join(board.root, 'webapp/assets')
    mkdirSync(assets, { recursive: true })
    copyFileSync(
      join(board.root, 'marketing/assets/clip.webm'),
      join(assets, 'clip.webm'),
    )
    writeFileSync(join(assets, 'voice.ogg'), 'not audio')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** Places a file from the picker into the row's gap. */
  async function place(page: Page, file: string) {
    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')
    await tools(page).getByRole('button', { name: 'Shapes' }).click()
    await page.getByRole('menuitem', { name: /Image, video, or audio/ }).click()
    await page.getByRole('button', { name: `Place ${file}` }).click()
    await page.mouse.click(one.x + one.width + 20, one.y + one.height / 2)
  }

  test('a placed video scrubs from the canvas bar writing nothing, and Muted in the file drops muted', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)

    await place(page, 'clip.webm')
    await expect
      .poll(read)
      .toContain(
        '<video data-name="clip.webm" src="../assets/clip.webm" autoplay muted loop playsinline style="width: 160px; height: 90px; object-fit: cover"></video>',
      )
    const bar = page.locator('[data-media-bar]')
    await bar.getByRole('button', { name: 'Pause' }).click()
    const placed = read()
    const video = hero(page).locator('video')
    const track = bar.getByRole('slider', { name: 'Position' })
    const box = await track.boundingBox()
    if (!box) throw new Error('The bar draws no track')

    await track.click({ position: { x: box.width * 0.9, y: box.height / 2 } })
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeGreaterThan(0.7)
    await track.click({ position: { x: box.width * 0.1, y: box.height / 2 } })
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeLessThan(0.3)
    await bar.getByRole('button', { name: 'Sound on' }).click()
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.muted))
      .toBe(false)
    expect(read()).toBe(placed)

    await page.getByRole('switch', { name: 'Muted in the file' }).click()

    await expect
      .poll(read)
      .toBe(
        placed.replace(
          'autoplay muted loop playsinline',
          'autoplay loop playsinline',
        ),
      )
  })

  test('a picked audio file lands as a player 300px wide', async ({ page }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const original = read()

    await place(page, 'voice.ogg')

    await expect
      .poll(read)
      .toBe(
        original.replace(
          '<div data-name="Two"',
          '<audio data-name="voice.ogg" src="../assets/voice.ogg" controls style="width: 300px"></audio><div data-name="Two"',
        ),
      )
  })
})
