import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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
        '<video data-name="clip.webm" src="../assets/clip.webm" controls autoplay muted loop playsinline style="width: 160px; height: 90px; object-fit: cover"></video>',
      )
    const bar = page.locator('[data-media-bar]')
    // At the fit zoom the video is too narrow on screen for the bar to hold
    // its track, so the view pinches in on it, keeping it under the pointer.
    const small = await hero(page).locator('video').boundingBox()
    if (!small) throw new Error('The placed video draws no box')
    await page.mouse.move(small.x + small.width / 2, small.y + small.height / 2)
    await pinch(page, -100)
    await expect(bar.getByRole('slider', { name: 'Position' })).toBeVisible()
    // The bar sits inside the video's bottom edge, 4px in on three sides.
    await expect
      .poll(async () => {
        const [inside, around] = await Promise.all([
          bar.boundingBox(),
          hero(page).locator('video').boundingBox(),
        ])
        return inside && around
          ? [
              Math.round(inside.x - around.x),
              Math.round(around.x + around.width - inside.x - inside.width),
              Math.round(around.y + around.height - inside.y - inside.height),
            ]
          : null
      })
      .toEqual([4, 4, 4])
    await bar.getByRole('button', { name: 'Pause' }).click()
    // Tab moves through the bar's controls rather than walking the selection.
    await page.keyboard.press('Tab')
    await expect(bar.getByRole('slider', { name: 'Position' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(bar.getByRole('button', { name: 'Sound on' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(bar.getByRole('button', { name: 'Play' })).toBeFocused()
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

  test('a video tile dropped on empty canvas makes a frame its size, which pauses from its own strip in Play', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page.getByRole('tab', { name: 'Assets' }).click()
    const layer = await page.locator('[data-hit-layer]').boundingBox()
    const frames = await page
      .locator('[data-frame]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().bottom),
      )
    if (!layer) throw new Error('The hit layer draws no box')
    // Under every frame, where the canvas is bare.
    const bare = {
      x: layer.x + layer.width / 2,
      y: (Math.max(...frames) + layer.y + layer.height) / 2,
    }
    const made = join(board.root, 'webapp/home/clip.html')

    await page.getByRole('button', { name: /^Copy path of clip.webm,/ }).hover()
    await page.mouse.down()
    await page.mouse.move(bare.x - 30, bare.y, { steps: 5 })
    await page.mouse.move(bare.x, bare.y, { steps: 5 })
    await expect(page.locator('[data-drop-ghost]')).toContainText('160 × 90')
    await page.mouse.up()

    await expect
      .poll(() => (existsSync(made) ? readFileSync(made, 'utf8') : ''))
      .toContain(
        '<video data-name="clip.webm" src="../assets/clip.webm" controls autoplay muted loop playsinline style="width: 160px; height: 90px; object-fit: cover"></video>',
      )
    const video = page
      .frameLocator('[data-frame="webapp/home/clip"] iframe')
      .locator('video')
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
      .toBe(false)
    // The frame is the media's size, so the video fills its page edge to edge.
    expect(
      await video.evaluate((node) => {
        const box = node.getBoundingClientRect()
        return [
          box.left,
          box.top,
          box.width,
          box.height,
          innerWidth,
          innerHeight,
        ]
      }),
    ).toEqual([0, 0, 160, 90, 160, 90])

    const play = page.getByRole('button', { name: 'Play' })
    await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'true')
    // In Play a frame takes no pointer until it is entered, so the press goes by its point.
    const madeBox = await video.boundingBox()
    if (!madeBox) throw new Error('The new frame draws no video')
    const middle = {
      x: madeBox.x + madeBox.width / 2,
      y: madeBox.y + madeBox.height / 2,
    }
    await page.mouse.click(middle.x, middle.y)
    await expect(
      page.locator('[data-frame="webapp/home/clip"][data-entered]'),
    ).toBeVisible()
    // The strip's own key, which a video with no `controls` never takes.
    await video.focus()
    await page.keyboard.press('Space')

    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
      .toBe(true)
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

/**
 * A trackpad pinch of `deltaY` in all, sent as the small Ctrl wheels a
 * trackpad sends, since one large wheel reads as a mouse notch and steps once.
 */
async function pinch(page: Page, deltaY: number): Promise<void> {
  const parts = Math.ceil(Math.abs(deltaY) / 25)
  await page.keyboard.down('Control')
  for (let sent = 0; sent < parts; sent++) {
    await page.mouse.wheel(0, deltaY / parts)
  }
  await page.keyboard.up('Control')
}
