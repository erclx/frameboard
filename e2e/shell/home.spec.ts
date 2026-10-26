import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { openSheetAtDesktop } from '../support/shortcuts-sheet'

const UNDO = 'ControlOrMeta+KeyZ'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})

test('reduced motion reaches the page', async ({ page }) => {
  await page.goto('/')
  const isReduced = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  expect(isReduced).toBe(true)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the home shortcuts sheet in ${colorScheme}`, () => {
    test.use({ colorScheme })

    test('keeps every label and chip on one line in a wider first column', async ({
      page,
    }) => {
      await page.goto('/')

      const { first, second } = await openSheetAtDesktop(page)

      expect(first / second).toBeCloseTo(1.3, 1)
    })
  })
}

test.describe('projects by hand from the home view', () => {
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

  /** The card of `name` alone, never a copy whose name starts with it. */
  function card(page: Page, name: string) {
    return page.getByRole('link', { name: new RegExp(`^${name}(?![-\\w])`) })
  }

  async function runFromMenu(page: Page, name: string, item: string) {
    await card(page, name).click({ button: 'right' })
    await page.getByRole('menuitem', { name: item }).click()
  }

  test('creates, renames, duplicates, and deletes a project, and undo restores the delete', async ({
    page,
  }) => {
    const asset = readFileSync(at('studio/assets/dot.svg'))
    await openAsWriter(page)

    await page.getByRole('button', { name: 'New project' }).click()
    await expect(
      page.getByRole('textbox', { name: 'Rename project untitled' }),
    ).toBeFocused()
    await page.keyboard.type('brand')
    await page.keyboard.press('Enter')
    await expect(card(page, 'brand')).toBeVisible()
    expect(existsSync(at('untitled'))).toBe(false)

    await runFromMenu(page, 'studio', 'Duplicate')
    await expect(card(page, 'studio-2')).toBeVisible()
    expect(readFileSync(at('studio-2/assets/dot.svg'))).toEqual(asset)

    await runFromMenu(page, 'studio', 'Delete')
    await expect(card(page, 'studio')).toHaveCount(0)
    expect(existsSync(at('studio'))).toBe(false)

    await page.keyboard.press(UNDO)

    await expect(card(page, 'studio')).toBeVisible()
    expect(readFileSync(at('studio/assets/dot.svg'))).toEqual(asset)
    await expect(page).toHaveURL(`${server.url}/`)
  })

  test("draws a card's frame capture and redraws it once the frame changes", async ({
    page,
  }) => {
    await page.goto(`${server.url}/`)
    const hero = card(page, 'studio').locator(
      '[data-skeleton] image[href*="ref=studio%2Fhome%2Fhero&"]',
    )
    // A capture renders on the server's browser after the first ask.
    await expect(hero).toHaveCount(1, { timeout: 15_000 })
    const first = (await hero.getAttribute('href')) ?? ''
    const served = await page.request.get(`${server.url}${first}`)
    expect([served.status(), served.headers()['content-type']]).toEqual([
      200,
      'image/png',
    ])

    writeFileSync(at('studio/home/hero.html'), '<h1>Changed</h1>')

    // The old capture goes stale at once, and the new one lands under a new stamp.
    await expect
      .poll(
        () =>
          hero.evaluateAll((images) =>
            images.map((image) => image.getAttribute('href')),
          ),
        { timeout: 15_000 },
      )
      .toEqual([expect.not.stringMatching(`^${escapeRegExp(first)}$`)])
  })
})
