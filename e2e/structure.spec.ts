import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const UNDO = 'ControlOrMeta+KeyZ'

test.describe('page structure by hand, and its undo', () => {
  let board: FixtureBoard
  let server: BoardServer

  const at = (path: string) => join(board.root, path)
  const pageOrder = () =>
    (
      JSON.parse(readFileSync(at('studio/project.json'), 'utf8')) as {
        pages: string[]
      }
    ).pages

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** Opens the board through a ticket and waits for the add button to light, which needs write access. */
  async function openAsWriter(page: Page): Promise<void> {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    await expect(
      page.getByRole('button', { name: 'Add page' }),
    ).not.toHaveAttribute('aria-disabled')
  }

  function pageLink(page: Page, name: string) {
    return page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name, exact: true })
  }

  /** Waits for Undo to light, which the server's history message does once a step is recorded. */
  async function undo(page: Page): Promise<void> {
    await expect(
      page.getByRole('button', { name: 'Undo' }),
    ).not.toHaveAttribute('aria-disabled')
    await page.keyboard.press(UNDO)
  }

  test('adds a page after the current one, and undo takes it away', async ({
    page,
  }) => {
    await openAsWriter(page)

    await page.getByRole('button', { name: 'Add page' }).click()
    await expect(
      page.getByRole('textbox', { name: /Rename page/ }),
    ).toBeFocused()
    await page.keyboard.press('Escape')

    expect(pageOrder()).toEqual(['home', 'page-3', 'pricing'])
    await expect(page).toHaveURL(/\/p\/studio\/page-3$/)

    await undo(page)

    await expect.poll(() => existsSync(at('studio/page-3'))).toBe(false)
    expect(pageOrder()).toEqual(['home', 'pricing'])
    await expect(page).toHaveURL(/\/p\/studio\/home$/)
  })

  test('renames the page on the canvas, and undo brings the old name back', async ({
    page,
  }) => {
    await openAsWriter(page)

    await pageLink(page, 'home').dblclick()
    await page.keyboard.type('start')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/p\/studio\/start$/)
    expect(existsSync(at('studio/start/hero.html'))).toBe(true)

    await undo(page)

    await expect(page).toHaveURL(/\/p\/studio\/home$/)
    expect(existsSync(at('studio/home/hero.html'))).toBe(true)
    expect(pageOrder()).toEqual(['home', 'pricing'])
  })

  test('drags a page above another, and undo restores the order', async ({
    page,
  }) => {
    await openAsWriter(page)
    const home = pageLink(page, 'home')
    const box = await home.boundingBox()
    if (!box) throw new Error('The home row has no box on screen')

    await pageLink(page, 'pricing').dragTo(home, {
      targetPosition: { x: box.width / 2, y: 2 },
    })

    await expect.poll(pageOrder).toEqual(['pricing', 'home'])

    await undo(page)

    await expect.poll(pageOrder).toEqual(['home', 'pricing'])
  })

  test('deletes a page with its note, and undo returns both byte for byte', async ({
    page,
  }) => {
    const notes = '{"version":1,"notes":[]}\n'
    writeFileSync(at('studio/pricing/notes.json'), notes)
    await openAsWriter(page)

    await pageLink(page, 'pricing').focus()
    await page.keyboard.press('Delete')

    await expect.poll(() => existsSync(at('studio/pricing'))).toBe(false)
    expect(pageOrder()).toEqual(['home'])

    await undo(page)

    await expect.poll(() => existsSync(at('studio/pricing'))).toBe(true)
    expect(readFileSync(at('studio/pricing/notes.json'), 'utf8')).toBe(notes)
    expect(pageOrder()).toEqual(['home', 'pricing'])
  })

  test('refuses an undo an agent overtook and says so', async ({ page }) => {
    await openAsWriter(page)
    await pageLink(page, 'pricing').dragTo(pageLink(page, 'home'), {
      targetPosition: { x: 20, y: 2 },
    })
    await expect.poll(pageOrder).toEqual(['pricing', 'home'])

    writeFileSync(
      at('studio/project.json'),
      `${JSON.stringify({ version: 1, pages: ['home', 'pricing'] }, null, 2)}\n`,
    )
    await undo(page)

    await expect(page.getByText('Undo skipped')).toBeVisible()
    await expect(
      page.getByText(
        'An agent changed the page order after your edit, so that step was dropped.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(pageOrder()).toEqual(['home', 'pricing'])
  })
})
