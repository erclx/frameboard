import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Locator, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

test.describe('a frame an agent claims', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  function editing(...args: string[]) {
    return run('node', [
      CLI,
      'editing',
      ...args,
      '--root',
      board.root,
      '--json',
    ])
  }

  test('shows on the board while held, refuses a second session, and clears on release', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/studio/home`)
    const hero = page.locator('[data-frame="studio/home/hero"]')
    await expect(hero.locator('iframe')).toBeVisible()

    await editing('studio/home/hero', '--session', 'sess-a')

    await expect(hero).toHaveAttribute('data-claimed')
    await expect(hero.getByText(/editing · \d+s/)).toBeVisible()
    const refused = await editing(
      'studio/home/hero',
      '--session',
      'sess-b',
    ).catch((error: { code: number; stdout: string }) => error)
    expect(refused).toMatchObject({ code: 4 })
    expect(JSON.parse(String(refused.stdout)).error.code).toBe('frame-claimed')

    await editing('studio/home/hero', '--release', '--session', 'sess-a')

    await expect(hero).not.toHaveAttribute('data-claimed')
    await expect(hero.getByText(/editing ·/)).toHaveCount(0)
  })

  test('a drag of a claimed frame waits on the card and writes once on release', async ({
    page,
  }) => {
    const layout = () =>
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    const mobile = page.locator('[data-frame="studio/home/mobile"]')
    await expect(mobile.locator('iframe')).toBeVisible()
    // The inspector's fields light once the server grants this tab writes.
    const hero = await center(page.locator('[data-frame="studio/home/hero"]'))
    await page.mouse.click(hero.x, hero.y)
    await expect(
      page.getByRole('textbox', { name: 'X position' }),
    ).toBeEnabled()
    await editing('studio/home/mobile', '--session', 'sess-a')
    await expect(mobile).toHaveAttribute('data-claimed')
    const before = layout()

    const from = await center(mobile)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 120, from.y + 60, { steps: 8 })
    await page.mouse.up()

    await expect(
      page.locator('[data-waiting-card="studio/home/mobile"]'),
    ).toContainText('Your move will wait until it finishes')
    // A window in which a write sent too early would have reached the file.
    await page.waitForTimeout(500)
    expect(layout()).toBe(before)

    await editing('studio/home/mobile', '--release', '--session', 'sess-a')

    await expect.poll(layout, { timeout: 5000 }).not.toBe(before)
    await expect(page.locator('[data-waiting-card]')).toHaveCount(0)
  })
})

test.describe('an element edit on a claimed frame', () => {
  let board: FixtureBoard
  let server: BoardServer
  const HERO = 'webapp/home/hero'
  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('is refused with the stale toast once the agent wrote the frame meanwhile', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    await expect(async () => {
      const box = await headline.boundingBox()
      if (!box) throw new Error('the headline has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.up('Meta')
      await expect(page.getByRole('heading', { name: 'Element' })).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })
    await run('node', [
      CLI,
      'editing',
      HERO,
      '--session',
      'sess-a',
      '--root',
      board.root,
      '--json',
    ])
    await expect(page.locator(`[data-frame="${HERO}"]`)).toHaveAttribute(
      'data-claimed',
    )

    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')
    await expect(page.locator(`[data-waiting-card="${HERO}"]`)).toBeVisible()
    const agent = read().replace('Caption', 'Byline')
    writeFileSync(path(), agent)
    await run('node', [
      CLI,
      'editing',
      HERO,
      '--release',
      '--session',
      'sess-a',
      '--root',
      board.root,
      '--json',
    ])

    await expect(page.getByText('Edit not saved')).toBeVisible()
    expect(read()).toBe(agent)
  })
})

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element has no box on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
