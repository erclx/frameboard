import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const CLI = resolve('dist/cli.js')
const SESSION = 'e2e-follow-1'
const run = promisify(execFile)

test.describe('what an agent changed', () => {
  let board: FixtureBoard
  let server: BoardServer

  const at = (path: string) => join(board.root, path)

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  async function openAsWriter(page: Page): Promise<void> {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    await expect(
      page.getByRole('button', { name: 'Add page' }),
    ).not.toHaveAttribute('aria-disabled')
  }

  /** Writes a frame's file the way an agent does, changing its heading. */
  function writeAsAgent(path: string, heading: string): void {
    const source = readFileSync(at(path), 'utf8')
    writeFileSync(
      at(path),
      source.replace(/<h1>[^<]*<\/h1>/, `<h1>${heading}</h1>`),
    )
  }

  function pageRow(page: Page, name: string) {
    return page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: new RegExp(`^${name}`) }) })
  }

  test('marks a frame an agent wrote, shows it, and clears once looked at', async ({
    page,
  }) => {
    await openAsWriter(page)

    writeAsAgent('studio/pricing/plans.html', 'Plans for teams')

    await expect(
      pageRow(page, 'pricing').getByRole('img', { name: '1 unseen change' }),
    ).toBeVisible()
    const toast = page.locator('[data-change-toast]')
    await expect(toast).toContainText('plans changed')

    await toast.getByRole('button', { name: 'Show' }).click()

    await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
    const plans = page.locator('[data-frame="studio/pricing/plans"]')
    await expect(plans.locator('iframe')).toBeVisible()
    await expect(
      page.locator('[data-change-glow="studio/pricing/plans"]').first(),
    ).toBeAttached()
    await expect(page.getByRole('img', { name: 'Unseen change' })).toHaveCount(
      0,
    )
    await expect(
      pageRow(page, 'pricing').getByRole('img', { name: /unseen/ }),
    ).toHaveCount(0)
  })

  test('marks nothing for a page renamed through the board', async ({
    page,
  }) => {
    await openAsWriter(page)

    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'home', exact: true })
      .dblclick()
    await page.getByRole('textbox', { name: /Rename page/ }).fill('start')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/p\/studio\/start$/)
    // An agent write after the rename is the sentinel: its mark lands after
    // any the rename's batch would have made.
    writeAsAgent('studio/pricing/plans.html', 'Plans for teams')

    await expect(
      pageRow(page, 'pricing').getByRole('img', { name: '1 unseen change' }),
    ).toBeVisible()
    await expect(
      pageRow(page, 'start').getByRole('img', { name: /unseen/ }),
    ).toHaveCount(0)
  })

  test.describe('following an agent', () => {
    let follower: ChildProcess | undefined

    test.afterEach(() => {
      follower?.kill('SIGTERM')
    })

    /** Claims a frame for the followed session and writes it, as an agent does. */
    async function claimAndWrite(path: string, heading: string) {
      await run('node', [
        CLI,
        'editing',
        path.replace(/\.html$/, ''),
        '--session',
        SESSION,
        '--root',
        board.root,
        '--json',
      ])
      writeAsAgent(path, heading)
    }

    /** How far a frame's center sits from the canvas's, in screen pixels. */
    async function offCenter(page: Page, frame: Locator): Promise<number> {
      const [canvas, box] = await Promise.all([
        page.locator('[data-canvas]').boundingBox(),
        frame.boundingBox(),
      ])
      if (!canvas || !box) return Infinity
      return Math.hypot(
        box.x + box.width / 2 - (canvas.x + canvas.width / 2),
        box.y + box.height / 2 - (canvas.y + canvas.height / 2),
      )
    }

    test('reaches each frame the agent works on across pages and stops on a hand pan', async ({
      page,
    }) => {
      follower = spawn('node', [
        CLI,
        'inbox',
        '--follow',
        '--session',
        SESSION,
        '--root',
        board.root,
      ])
      await openAsWriter(page)
      const initial = page
        .getByRole('complementary', { name: 'Inspector' })
        .getByRole('button', { name: /, (listening|editing)$/ })
      await initial.click()
      await expect(initial).toHaveAttribute('aria-pressed', 'true')
      await expect(initial).toContainText('Following')

      await claimAndWrite('studio/home/mobile.html', 'Mobile, warmer')

      const mobile = page.locator('[data-frame="studio/home/mobile"]')
      await expect.poll(() => offCenter(page, mobile)).toBeLessThan(2)
      // Looked at long enough to clear, so the home row is clean for the end.
      await expect(
        pageRow(page, 'home').getByRole('img', { name: /unseen/ }),
      ).toHaveCount(0)

      await claimAndWrite('studio/pricing/plans.html', 'Plans for teams')

      await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
      const plans = page.locator('[data-frame="studio/pricing/plans"]')
      await expect.poll(() => offCenter(page, plans)).toBeLessThan(2)

      const canvas = page.locator('[data-canvas]')
      await canvas.hover()
      await page.mouse.wheel(120, 80)
      await expect(initial).toHaveAttribute('aria-pressed', 'false')
      await expect(initial).not.toContainText('Following')
      const layer = page.locator('[data-layer]')
      const panned = await layer.getAttribute('style')

      await claimAndWrite('studio/home/hero.html', 'Hero, later')

      await expect(
        pageRow(page, 'home').getByRole('img', { name: '1 unseen change' }),
      ).toBeVisible()
      await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
      expect(await layer.getAttribute('style')).toBe(panned)
    })
  })
})
