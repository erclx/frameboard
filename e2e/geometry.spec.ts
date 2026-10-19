import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const MOBILE = '[data-frame="studio/home/mobile"]'
const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element has no box on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Opens the home page through a ticket and waits for the server to grant
 * this tab writes, which the inspector's fields show by enabling once the
 * unlocked hero is selected.
 */
async function openAsWriter(page: Page, server: BoardServer): Promise<void> {
  await page.goto(await server.ticketUrl())
  await page.goto(`${server.url}/p/studio/home`)
  const hero = await center(page.locator('[data-frame="studio/home/hero"]'))
  await page.mouse.click(hero.x, hero.y)
  await expect(page.getByRole('textbox', { name: 'X position' })).toBeEnabled()
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
}

test.describe('frame geometry by hand', () => {
  let board: FixtureBoard
  let server: BoardServer

  const layout = () =>
    JSON.parse(
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
    ) as { frames: Record<string, Record<string, unknown>> }

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('a drag writes the layout once, on release', async ({ page }) => {
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    const mobile = page.locator(MOBILE)
    await expect(mobile).toBeVisible()
    const from = await center(mobile)

    await drag(page, from, { x: from.x + 120, y: from.y + 60 })
    const during = layout().frames.mobile
    await page.mouse.up()

    expect(during).toMatchObject({ x: 1520, y: 0 })
    await expect.poll(() => layout().frames.mobile?.x).not.toBe(1520)
    expect(layout().frames.mobile).toMatchObject({
      width: 390,
      height: 844,
    })
    await expect(mobile).toHaveAttribute('data-selected', 'true')
  })

  test('a marquee selects two frames and Alt+S aligns their bottoms', async ({
    page,
  }) => {
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    await expect(page.locator(MOBILE)).toBeVisible()
    const canvas = await page.locator('[data-canvas]').boundingBox()
    if (!canvas) throw new Error('The canvas has no box on screen')

    await drag(
      page,
      { x: canvas.x + 8, y: canvas.y + 8 },
      { x: canvas.x + canvas.width - 8, y: canvas.y + canvas.height - 120 },
    )
    await page.mouse.up()
    await expect(page.locator('[data-frame][data-selected]')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: '2 frames' })).toBeVisible()
    await page.keyboard.press('Alt+KeyS')

    // The hero is 900 tall and the phone 844, so the phone drops by 56.
    await expect.poll(() => layout().frames.mobile?.y).toBe(56)
    expect(layout().frames.hero).toMatchObject({ y: 0 })
  })

  test('a locked frame selects and never moves', async ({ page }) => {
    const locked = layout()
    locked.frames.mobile = { ...locked.frames.mobile, locked: true }
    writeFileSync(
      join(board.root, 'studio/home/layout.json'),
      JSON.stringify(locked),
    )
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    const mobile = page.locator(MOBILE)
    await expect(mobile).toBeVisible()
    const before = await mobile.boundingBox()
    const from = await center(mobile)

    await drag(page, from, { x: from.x + 120, y: from.y + 60 })
    await page.mouse.up()

    await expect(mobile).toHaveAttribute('data-selected', 'true')
    // A later write that does land bounds the wait, since a move the locked
    // drag wrongly sent would have reached the server ahead of this nudge.
    const hero = await center(page.locator('[data-frame="studio/home/hero"]'))
    await page.mouse.click(hero.x, hero.y)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => layout().frames.hero?.x).toBe(1)

    expect(layout().frames.mobile).toEqual(locked.frames.mobile)
    expect(await mobile.boundingBox()).toEqual(before)
  })

  test('Cmd+Z puts a dragged frame back at once', async ({ page }) => {
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    const mobile = page.locator(MOBILE)
    const before = await mobile.boundingBox()
    const from = await center(mobile)
    await drag(page, from, { x: from.x + 120, y: from.y + 60 })
    await page.mouse.up()
    await expect.poll(() => layout().frames.mobile?.x).not.toBe(1520)
    await expect(
      page.getByRole('button', { name: 'Undo' }),
    ).not.toHaveAttribute('aria-disabled')

    await page.keyboard.press('ControlOrMeta+KeyZ')

    await expect
      .poll(() => layout().frames.mobile)
      .toMatchObject({
        x: 1520,
        y: 0,
      })
    // The undone box draws well inside the 2 s a landed box would otherwise stay pending.
    await expect
      .poll(async () => (await mobile.boundingBox())?.x, { timeout: 1000 })
      .toBe(before?.x)
  })

  test("an agent's later move refuses the undo of a hand move", async ({
    page,
  }) => {
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    const from = await center(page.locator(MOBILE))
    await drag(page, from, { x: from.x + 120, y: from.y + 60 })
    await page.mouse.up()
    await expect.poll(() => layout().frames.mobile?.x).not.toBe(1520)

    await run('node', [
      CLI,
      'frame',
      'move',
      'studio/home/mobile',
      '--x',
      '3000',
      '--root',
      board.root,
    ])
    await expect(
      page.getByRole('button', { name: 'Undo' }),
    ).not.toHaveAttribute('aria-disabled')
    await page.keyboard.press('ControlOrMeta+KeyZ')

    await expect(page.getByText('Undo skipped')).toBeVisible()
    expect(layout().frames.mobile).toMatchObject({ x: 3000 })
  })
})
