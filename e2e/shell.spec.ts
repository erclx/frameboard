import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const BOARD = '/p/webapp/home'

function leftPanel(page: Page) {
  return page.getByRole('complementary', { name: 'Pages and layers' })
}

async function widthOf(page: Page): Promise<number> {
  const box = await leftPanel(page).boundingBox()
  if (!box) throw new Error('The left panel is not on screen')
  return Math.round(box.width)
}

async function edgeCenter(page: Page): Promise<[number, number]> {
  const edge = await page
    .getByRole('separator', { name: 'Resize the left panel' })
    .boundingBox()
  if (!edge) throw new Error('The left panel has no edge to drag')
  return [edge.x + edge.width / 2, edge.y + edge.height / 2]
}

/** Drags the left panel's edge sideways by `dx` pixels. */
async function dragEdge(page: Page, dx: number): Promise<void> {
  const [x, y] = await edgeCenter(page)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
}

test.describe('the board shell', () => {
  test('keeps a resized panel width across a reload', async ({ page }) => {
    await page.goto(BOARD)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)

    await dragEdge(page, 80)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(320)
    await page.reload()

    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(320)
  })

  test('stops a panel at 400 and resets it on a double-click', async ({
    page,
  }) => {
    await page.goto(BOARD)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)

    await dragEdge(page, 400)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(400)
    await page.mouse.dblclick(...(await edgeCenter(page)))

    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)
  })

  test('opens with its UI hidden on a window under 1024 wide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 })

    await page.goto(BOARD)

    await expect(page.getByRole('button', { name: 'Show UI' })).toBeVisible()
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })
})

test.describe('Play', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(
      join(board.root, 'webapp/home/hero.html'),
      `<!doctype html><html lang="en"><head><title>hero</title></head><body>
<button type="button" onclick="this.textContent = 'Started'">Get started</button>
</body></html>`,
    )
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test("hands a click to a frame's button, and Esc inside the frame returns to Edit", async ({
    page,
  }) => {
    await page.goto(`${server.url}${BOARD}`)
    const hero = page.frameLocator('iframe[title="hero"]')
    await expect(
      hero.getByRole('button', { name: 'Get started' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Play' }).click()
    await hero.getByRole('button', { name: 'Get started' }).click()
    await expect(hero.getByRole('button', { name: 'Started' })).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
