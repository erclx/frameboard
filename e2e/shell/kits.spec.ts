import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

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
})
