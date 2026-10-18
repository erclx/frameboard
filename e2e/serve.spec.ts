import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

async function frameboard(...args: string[]) {
  const { stdout } = await run('node', [CLI, ...args, '--json'])
  return JSON.parse(stdout) as { ok: boolean; data: Record<string, unknown> }
}

test.describe('serve and show', () => {
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

  test('opens no tab under --no-open', () => {
    expect(server.data).toMatchObject({ reused: false, opened: false })
  })

  test('reuses the server and its connected tab rather than opening one', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/studio/home`)
    await expect(page.locator('[data-frame]')).toHaveCount(2)

    const second = await frameboard('serve', '--root', board.root)

    expect(second.data).toMatchObject({
      url: server.url,
      reused: true,
      opened: false,
    })
  })

  test('points the open board at a frame on another page', async ({ page }) => {
    await page.goto(`${server.url}/p/studio/home`)
    await expect(page.locator('[data-frame]')).toHaveCount(2)

    const shown = await frameboard(
      'show',
      'pricing/plans',
      '--root',
      board.root,
    )

    expect(shown.data).toMatchObject({ ref: 'studio/pricing/plans', tabs: 1 })
    await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
    await expect(
      page.locator('[data-frame="studio/pricing/plans"]'),
    ).toBeVisible()
  })

  test('zooms the open page to the frame shown', async ({ page }) => {
    await page.goto(`${server.url}/p/studio/home`)
    const layer = page.locator('[data-layer]')
    await expect(page.locator('[data-frame]')).toHaveCount(2)
    // Fitting both home frames between the two panels scales to about 0.35.
    await expect
      .poll(() => layer.evaluate((element) => element.style.transform))
      .toMatch(/scale\(0\.35\d*\)$/)

    await frameboard('show', 'home/mobile', '--root', board.root)

    // Fitting the phone frame alone, 844 tall in a canvas 720 tall less padding, scales to about 0.70.
    await expect
      .poll(() => layer.evaluate((element) => element.style.transform))
      .toMatch(/scale\(0\.70\d*\)$/)
  })
})
