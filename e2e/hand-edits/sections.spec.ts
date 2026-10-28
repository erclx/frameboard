import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = '[data-frame="studio/home/hero"]'
const MOBILE = '[data-frame="studio/home/mobile"]'

interface Layout {
  frames: Record<string, { x: number; y: number }>
  sections?: Record<string, { x: number; y: number }>
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element has no box on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Opens the home page as a writer, which the inspector shows by enabling once hero is selected. */
async function openAsWriter(page: Page, server: BoardServer): Promise<void> {
  await page.goto(await server.ticketUrl())
  await page.goto(`${server.url}/p/studio/home`)
  const hero = await center(page.locator(HERO))
  await page.mouse.click(hero.x, hero.y)
  await expect(page.getByRole('textbox', { name: 'X position' })).toBeEnabled()
}

test.describe('page sections by hand', () => {
  let board: FixtureBoard
  let server: BoardServer

  const layout = () =>
    JSON.parse(
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
    ) as Layout

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('wraps two frames, drags the section with them, and undoes the drag', async ({
    page,
  }) => {
    server = await serveBoard(board.root)
    await openAsWriter(page, server)
    const mobile = await center(page.locator(MOBILE))
    await page.keyboard.down('Shift')
    await page.mouse.click(mobile.x, mobile.y)
    await page.keyboard.up('Shift')

    await page.keyboard.press('ControlOrMeta+Alt+KeyG')

    await expect
      .poll(() => layout().sections?.section)
      .toMatchObject({
        x: -40,
        y: -200,
      })
    await expect(
      page
        .getByRole('list', { name: 'Frames of section' })
        .getByRole('listitem'),
    ).toHaveCount(2)

    // Pressed at its left end, which sits clear of hero's label and its buttons.
    const label = await page
      .locator('[data-section-label="section"]')
      .boundingBox()
    if (!label) throw new Error('The section name has no box on screen')
    const name = { x: label.x + 6, y: label.y + label.height / 2 }
    await page.mouse.move(name.x, name.y)
    await page.mouse.down()
    await page.mouse.move(name.x + 120, name.y + 90, { steps: 8 })
    await page.mouse.up()

    await expect.poll(() => layout().sections?.section?.x).not.toBe(-40)
    const moved = layout()
    const dx = (moved.sections?.section?.x ?? 0) + 40
    expect([moved.frames.hero?.x, moved.frames.mobile?.x]).toEqual([
      dx,
      1520 + dx,
    ])

    await page.keyboard.press('ControlOrMeta+KeyZ')

    await expect
      .poll(() => [
        layout().sections?.section?.x,
        layout().frames.hero?.x,
        layout().frames.mobile?.x,
      ])
      .toEqual([-40, 0, 1520])
  })
})
