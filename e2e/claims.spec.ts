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
})
