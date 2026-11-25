import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

const MOBILE = '[data-frame="studio/home/mobile"]'
// Wholly below the 844 px tall frame's edge.
const BADGE =
  '<div style="position: absolute; left: 40px; top: 864px; width: 200px; height: 40px; background: rgb(37 99 235)"></div>'
// Wholly past both the left and the top edge.
const CORNER =
  '<div style="position: absolute; left: -80px; top: -70px; width: 60px; height: 40px; background: rgb(37 99 235)"></div>'

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element has no box on screen')
  return box
}

/** How many of the picture's pixels are the element's own fill, and how many it has. */
async function filled(picture: Locator) {
  return picture.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context?.drawImage(image, 0, 0)
    const data =
      context?.getImageData(0, 0, canvas.width, canvas.height).data ?? []
    let blue = 0
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] === 37 && data[at + 1] === 99 && data[at + 2] === 235) {
        blue += 1
      }
    }
    return { blue, all: canvas.width * canvas.height }
  })
}

test.describe('a frame showing its content past the edge', () => {
  let board: FixtureBoard
  let server: BoardServer

  const entry = () =>
    JSON.parse(
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
    ).frames.mobile as Record<string, unknown>

  async function open(page: Page, element: string) {
    board = copyFixtureBoard('live')
    const file = join(board.root, 'studio/home/mobile.html')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('</body>', `${element}</body>`),
    )
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
  }

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  async function selectMobile(page: Page) {
    const box = await boxOf(page.locator(MOBILE))
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(
      page.getByRole('textbox', { name: 'X position' }),
    ).toBeEnabled()
  }

  test('turning clip off paints the element below the edge at its box, and an undo takes it away', async ({
    page,
  }) => {
    await open(page, BADGE)
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/frames/png')) asked.push(request.url())
    })
    const picture = page.locator('img[src^="/api/frames/png"]')
    await selectMobile(page)

    await page.getByRole('switch', { name: 'Clip content' }).click()
    await expect.poll(entry).toMatchObject({ showOverflow: true })
    await page.keyboard.press('Escape')

    await expect(page.locator('[data-element-ghost]')).toHaveCount(0)
    await expect
      .poll(() => picture.evaluate((image: HTMLImageElement) => image.complete))
      .toBe(true)
    const frame = await boxOf(page.locator(MOBILE))
    const scale = frame.width / 390
    const painted = await boxOf(picture)
    expect(painted.x - frame.x).toBeCloseTo(40 * scale, 0)
    expect(painted.y - frame.y).toBeCloseTo(864 * scale, 0)
    expect(painted.width).toBeCloseTo(200 * scale, 0)
    expect(painted.height).toBeCloseTo(40 * scale, 0)
    const pixels = await filled(picture)
    expect(pixels).toEqual({ blue: 400 * 80, all: 400 * 80 })
    // The ghost and the picture alone share one request.
    expect(asked).toHaveLength(1)

    await undo(page)

    await expect.poll(entry).not.toHaveProperty('showOverflow')
    await expect(picture).toHaveCount(0)
  })
  test('an element past the top left corner paints at its box, and Export saves it whole', async ({
    page,
  }) => {
    await open(page, CORNER)
    const picture = page.locator('img[src^="/api/frames/png"]')
    await selectMobile(page)

    await page.getByRole('switch', { name: 'Clip content' }).click()
    await expect.poll(entry).toMatchObject({ showOverflow: true })
    await page.keyboard.press('Escape')

    await expect(page.locator('[data-element-ghost]')).toHaveCount(0)
    await expect
      .poll(() =>
        picture.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(120)
    const frame = await boxOf(page.locator(MOBILE))
    const scale = frame.width / 390
    const painted = await boxOf(picture)
    expect(painted.x - frame.x).toBeCloseTo(-80 * scale, 0)
    expect(painted.y - frame.y).toBeCloseTo(-70 * scale, 0)
    expect(painted.width).toBeCloseTo(60 * scale, 0)
    expect(await filled(picture)).toEqual({ blue: 120 * 80, all: 120 * 80 })

    await selectMobile(page)
    const ghost = await boxOf(page.locator('[data-element-ghost]'))
    await page.mouse.click(
      ghost.x + ghost.width / 2,
      ghost.y + ghost.height / 2,
    )
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.getByRole('tab', { name: 'Export' }).click()
    await page.getByRole('button', { name: 'Export theme' }).click()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export 1 file' }).click()
    const download = await downloading

    expect(download.suggestedFilename()).toContain('@2x.png')
    const bytes = readFileSync(await download.path())
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([120, 80])
  })
})
