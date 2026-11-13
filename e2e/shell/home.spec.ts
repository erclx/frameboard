import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undoAtHome } from '../support/history'
import { openSheetAtDesktop } from '../support/shortcuts-sheet'

type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>

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

    await undoAtHome(page)

    await expect(card(page, 'studio')).toBeVisible()
    expect(readFileSync(at('studio/assets/dot.svg'))).toEqual(asset)
    await expect(page).toHaveURL(`${server.url}/`)
  })

  test('drags a card onto another to make a folder, and undo takes it apart', async ({
    page,
  }) => {
    mkdirSync(at('brand/home'), { recursive: true })
    writeFileSync(
      at('brand/project.json'),
      JSON.stringify({ version: 1, pages: ['home'] }),
    )
    const groupOf = (name: string) =>
      JSON.parse(readFileSync(at(`${name}/project.json`), 'utf8')).group
    await openAsWriter(page)

    await card(page, 'brand').dragTo(card(page, 'studio'))

    await expect(
      page.getByRole('textbox', { name: 'Rename folder Folder' }),
    ).toBeFocused()
    expect([groupOf('studio'), groupOf('brand')]).toEqual(['Folder', 'Folder'])
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: /^Folder\s*2 projects/ }),
    ).toBeVisible()

    await undoAtHome(page)

    await expect(card(page, 'studio')).toBeVisible()
    await expect(card(page, 'brand')).toBeVisible()
    expect([groupOf('studio'), groupOf('brand')]).toEqual([
      undefined,
      undefined,
    ])
  })

  test('drags a row onto a filed row in an open list folder to file it there once', async ({
    page,
  }) => {
    writeFileSync(
      at('studio/project.json'),
      JSON.stringify({
        version: 1,
        pages: ['home', 'pricing'],
        group: 'Client',
      }),
    )
    mkdirSync(at('brand/home'), { recursive: true })
    writeFileSync(
      at('brand/project.json'),
      JSON.stringify({ version: 1, pages: ['home'] }),
    )
    const groupOf = (name: string) =>
      JSON.parse(readFileSync(at(`${name}/project.json`), 'utf8')).group
    await page.addInitScript(() =>
      localStorage.setItem('frameboard.home.layout', 'list'),
    )
    await openAsWriter(page)
    await page.getByRole('button', { name: /^Client/ }).click()
    const filings: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/project/group')) {
        filings.push(request.postData() ?? '')
      }
    })

    await card(page, 'brand').dragTo(card(page, 'studio'))

    await expect.poll(() => groupOf('brand')).toBe('Client')
    await undoAtHome(page)
    await expect.poll(() => groupOf('brand')).toBeUndefined()
    expect(filings).toEqual([
      JSON.stringify({ refs: ['brand'], group: 'Client' }),
    ])
  })

  /** Adds a project in no folder, enough to drag or to drop on. */
  function addProject(name: string): void {
    mkdirSync(at(`${name}/home`), { recursive: true })
    writeFileSync(
      at(`${name}/project.json`),
      JSON.stringify({ version: 1, pages: ['home'] }),
    )
  }

  /** The box of a shown element, raising rather than letting an overlap read false on nothing. */
  async function boxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) throw new Error(`No box for ${locator}`)
    return box
  }

  function overlaps(a: Box, b: Box): boolean {
    return (
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height
    )
  }

  /** The hint of the one item a held project is over. */
  function dropHint(page: Page) {
    return page.locator('li[data-drop-over] > [role="status"]')
  }

  /** Picks `source` up and holds it over `target`, never dropped, until the target says what a drop does. */
  async function holdOver(
    page: Page,
    source: Locator,
    target: Locator,
  ): Promise<void> {
    await source.hover()
    await page.mouse.down()
    await moveOver(page, target)
  }

  /**
   * Carries the held project to `target`, the second hover being the move that
   * reaches it. Forced, since the library's honey pot sits under the pointer
   * through a drag and would fail the hover's hit check.
   */
  async function moveOver(page: Page, target: Locator): Promise<void> {
    await target.hover({ force: true })
    await target.hover({ force: true })
    await expect(
      page.locator('li[data-drop-over]').filter({ has: target }),
    ).toBeVisible()
    await expect(dropHint(page)).toBeVisible()
  }

  test("keeps a target card's name and edited line clear of the drop hint", async ({
    page,
  }) => {
    addProject('brand')
    await openAsWriter(page)
    const target = card(page, 'studio')

    await holdOver(page, card(page, 'brand'), target)

    const hint = await boxOf(dropHint(page))
    const name = await boxOf(target.locator('[title="studio"]'))
    const edited = await boxOf(target.locator('[data-edited]'))
    expect(overlaps(hint, name)).toBe(false)
    expect(overlaps(hint, edited)).toBe(false)
  })

  test('keeps the drop hint for a long project name inside its card', async ({
    page,
  }) => {
    const long = 'a-project-name-long-enough-to-run-past-the-card-edge'
    addProject('brand')
    addProject(long)
    await openAsWriter(page)
    const target = card(page, long)

    await holdOver(page, card(page, 'brand'), target)

    const hint = await boxOf(dropHint(page))
    const box = await boxOf(target)
    expect(hint.x).toBeGreaterThanOrEqual(box.x)
    expect(hint.x + hint.width).toBeLessThanOrEqual(box.x + box.width)
  })

  test('keeps every list name clear of the drop hint, in and on an open folder', async ({
    page,
  }) => {
    writeFileSync(
      at('studio/project.json'),
      JSON.stringify({
        version: 1,
        pages: ['home', 'pricing'],
        group: 'Client',
      }),
    )
    addProject('brand')
    addProject('cover')
    await page.addInitScript(() =>
      localStorage.setItem('frameboard.home.layout', 'list'),
    )
    await openAsWriter(page)
    const folder = page.getByRole('button', { name: /^Client/ })
    await folder.click()
    const member = card(page, 'studio')
    const memberName = await boxOf(member.locator('[title="studio"]'))
    const folderBand = await boxOf(folder)

    await holdOver(page, card(page, 'brand'), card(page, 'cover'))
    const onRow = await boxOf(dropHint(page))
    const coverName = await boxOf(
      card(page, 'cover').locator('[title="cover"]'),
    )
    expect(overlaps(onRow, coverName)).toBe(false)

    await moveOver(page, folder)
    const onFolder = await boxOf(dropHint(page))
    expect(overlaps(onFolder, folderBand)).toBe(true)
    expect(overlaps(onFolder, memberName)).toBe(false)

    await moveOver(page, member)
    const onMember = await boxOf(dropHint(page))
    expect(overlaps(onMember, memberName)).toBe(false)
  })

  test("draws a list row's drop ring inside the row, where the list's clip cannot cut it", async ({
    page,
  }) => {
    addProject('brand')
    addProject('cover')
    await page.addInitScript(() =>
      localStorage.setItem('frameboard.home.layout', 'list'),
    )
    await openAsWriter(page)
    const target = card(page, 'cover')

    await holdOver(page, card(page, 'brand'), target)

    await expect(target).toHaveCSS('box-shadow', /inset/)
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
