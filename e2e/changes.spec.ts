import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

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
})
