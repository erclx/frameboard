import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

/** The accent the shipped Sketch kit's light tokens set, which the live board's own sheets never name. */
const SKETCH_ACCENT = '#e8590c'

test.describe('a kit set on one frame', () => {
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

  function frameboard(...args: string[]) {
    return run('node', [CLI, ...args, '--root', board.root, '--json'])
  }

  /** A frame's root once its heading has drawn, so a read of its tokens sees every sheet it loads. */
  async function rootOf(page: Page, frame: string) {
    const content = page.frameLocator(`iframe[title="${frame}"]`)
    await expect(content.getByRole('heading')).toBeVisible()
    return content.locator('html')
  }

  test('restyles the frame naming the kit, leaves its neighbor plain, and comes off with none', async ({
    page,
  }) => {
    await frameboard('kit', 'add', 'studio', 'sketch')
    await frameboard('frame', 'kit', 'studio/home/hero', 'sketch')

    await page.goto(`${server.url}/p/studio/home`)

    await expect(await rootOf(page, 'hero')).toHaveCSS(
      '--accent',
      SKETCH_ACCENT,
    )
    await expect(await rootOf(page, 'mobile')).toHaveCSS('--accent', '')

    await frameboard('frame', 'kit', 'studio/home/hero', 'none')
    await page.reload()

    await expect(await rootOf(page, 'hero')).toHaveCSS('--accent', '')
  })

  test('adds a kit from the Theme dialog, sets it on one frame by hand, takes it off with None, and undo puts it back', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    await expect(
      page.getByRole('button', { name: 'Add page' }),
    ).not.toHaveAttribute('aria-disabled')

    await page.getByRole('tab', { name: 'Theme' }).click()
    await page.getByRole('button', { name: /^Kits/ }).click()
    await page.getByRole('button', { name: 'Add kit' }).click()
    await page.getByRole('menuitem', { name: 'Sketch' }).click()
    await expect(
      page.getByRole('region', { name: 'Kits' }).getByRole('listitem'),
    ).toHaveText(['Sketchnot used'])
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const hero = page.locator('[data-frame="studio/home/hero"]')
    const box = await hero.boundingBox()
    if (!box) throw new Error('The hero frame has no box on screen')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(hero).toHaveAttribute('data-selected', 'true')

    const kit = page.getByRole('button', { name: /^Kit / })
    await kit.click()
    await page.getByRole('menuitemradio', { name: 'Sketch' }).click()

    // The open board restyles with no reload, as the watcher reloads a rekitted frame.
    await expect(await rootOf(page, 'hero')).toHaveCSS(
      '--accent',
      SKETCH_ACCENT,
    )
    await expect(await rootOf(page, 'mobile')).toHaveCSS('--accent', '')
    await expect(page.getByRole('button', { name: /^Kits/ })).toHaveText(
      'Kits · 1Sketch',
    )

    await kit.click()
    await page.getByRole('menuitemradio', { name: 'None' }).click()
    await expect(await rootOf(page, 'hero')).toHaveCSS('--accent', '')

    await undo(page)
    await expect(await rootOf(page, 'hero')).toHaveCSS(
      '--accent',
      SKETCH_ACCENT,
    )
  })
})
