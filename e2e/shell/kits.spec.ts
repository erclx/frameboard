import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

/** A file of a kit the tool ships, as the source tree holds it. */
function shippedKit(path: string): string {
  return join(import.meta.dirname, '../../src/server/kits/shipped', path)
}

test.describe('design kits from home', () => {
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

  /** Opens home through a ticket and waits for New project to light, which needs write access. */
  async function openAsWriter(page: Page): Promise<void> {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/`)
    await expect(
      page.getByRole('button', { name: 'New project' }),
    ).not.toHaveAttribute('aria-disabled')
  }

  test('starts a project in Sketch from New project, then saves it as a kit New project offers', async ({
    page,
  }) => {
    await openAsWriter(page)

    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog', { name: 'New project' })
    const sketch = dialog.getByRole('radio', { name: 'Sketch' })
    await sketch.locator('xpath=..').click()
    await expect(sketch).toBeChecked()
    await expect(
      dialog.frameLocator('iframe[title="Sketch sample"]').getByText('Idea'),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Create project' }).click()

    await expect(
      page.getByRole('textbox', { name: 'Rename project untitled' }),
    ).toBeFocused()
    expect(readFileSync(at('untitled/tokens.css'), 'utf8')).toBe(
      readFileSync(shippedKit('sketch/tokens.css'), 'utf8'),
    )
    expect(existsSync(at('untitled/kit/sample.html'))).toBe(true)
    await page.keyboard.press('Enter')

    await page
      .getByRole('link', { name: /^untitled/ })
      .click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Save as kit' }).click()
    await expect(page.getByText('Saved untitled as a kit')).toBeVisible()
    expect(existsSync(at('.kits/untitled/kit.json'))).toBe(true)

    await page.getByRole('button', { name: 'New project' }).click()
    await expect(
      page
        .getByRole('dialog', { name: 'New project' })
        .getByRole('radio', { name: 'untitled' }),
    ).toBeVisible()
  })
})
