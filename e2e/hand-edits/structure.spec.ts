import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

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

  /**
   * Marks the window inside every frame on the canvas, resolving how many it
   * marked, so a later read tells a kept iframe from one that loaded again.
   */
  async function markFrames(page: Page): Promise<number> {
    const frames = page.locator('[data-frame] iframe')
    await expect(frames).toHaveCount(2)
    await expect
      .poll(() =>
        frames.evaluateAll((all) =>
          all.every(
            (frame) =>
              (frame as HTMLIFrameElement).contentDocument?.readyState ===
              'complete',
          ),
        ),
      )
      .toBe(true)
    return frames.evaluateAll((all) => {
      for (const frame of all) {
        const view = (frame as HTMLIFrameElement).contentWindow
        if (view) Object.assign(view, { kept: true })
      }
      return all.length
    })
  }

  /** How many frames on the canvas still hold the mark `markFrames` set. */
  function keptFrames(page: Page): Promise<number> {
    return page
      .locator('[data-frame] iframe')
      .evaluateAll(
        (all) =>
          all.filter(
            (frame) =>
              (frame as HTMLIFrameElement).contentWindow &&
              'kept' in ((frame as HTMLIFrameElement).contentWindow ?? {}),
          ).length,
      )
  }

  /** The `src` of every frame on the canvas, which a reload changes at once. */
  function frameSources(page: Page): Promise<(string | null)[]> {
    return page
      .locator('[data-frame] iframe')
      .evaluateAll((all) => all.map((frame) => frame.getAttribute('src')))
  }

  /**
   * Records each live message as the page reads it, ahead of the board's own
   * listener, so a test can wait until the board has handled a whole batch.
   */
  async function recordLive(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const read: string[] = []
      Object.assign(window, { liveRead: read })
      window.WebSocket = class extends window.WebSocket {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args)
          this.addEventListener('message', (event) => {
            read.push(String(event.data))
          })
        }
      }
    })
  }

  /** How many live messages the page has read, taken before an action so its batch is never missed. */
  function liveRead(page: Page): Promise<number> {
    return page.evaluate(
      () => (window as unknown as { liveRead: string[] }).liveRead.length,
    )
  }

  /**
   * Waits for the board a rename's batch sends with the frame at its new ref,
   * read after `from`, then holds while any reload that batch sent would
   * land. The server sends a batch's reloads straight after its board, so a
   * frame the rename reloaded shows a new `src` inside the hold.
   */
  async function batchHandled(
    page: Page,
    from: number,
    ref: string,
  ): Promise<void> {
    await expect
      .poll(() =>
        page.evaluate(
          ([since, frame]) =>
            (window as unknown as { liveRead: string[] }).liveRead
              .slice(since)
              .some(
                (text) =>
                  text.startsWith('{"type":"board"') &&
                  text.includes(`"ref":"${frame}"`),
              ),
          [from, ref] as const,
        ),
      )
      .toBe(true)
    // The window a reload would land in, asserting nothing happened across it.
    await page.waitForTimeout(500)
  }

  test('renames the page on the canvas without reloading its frames', async ({
    page,
  }) => {
    await recordLive(page)
    await openAsWriter(page)
    const marked = await markFrames(page)
    const sources = await frameSources(page)
    const before = await liveRead(page)

    await pageLink(page, 'home').dblclick()
    await page.keyboard.type('start')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/p\/studio\/start$/)
    await batchHandled(page, before, 'studio/start/hero')
    await expect(
      page.locator('[data-frame="studio/start/hero"] iframe'),
    ).toBeAttached()
    expect(await frameSources(page)).toEqual(sources)
    expect(await keptFrames(page)).toBe(marked)
  })

  test('renames the project without reloading its frames, and undo moves the route back', async ({
    page,
  }) => {
    await recordLive(page)
    await openAsWriter(page)
    const marked = await markFrames(page)
    const sources = await frameSources(page)
    const beforeRename = await liveRead(page)

    await page.getByTitle('Rename studio').click()
    await page.keyboard.press('ControlOrMeta+KeyA')
    await page.keyboard.type('atelier')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/p\/atelier\/home$/)
    await batchHandled(page, beforeRename, 'atelier/home/hero')
    await expect(
      page.locator('[data-frame="atelier/home/hero"] iframe'),
    ).toBeAttached()
    expect(await frameSources(page)).toEqual(sources)
    expect(await keptFrames(page)).toBe(marked)

    const beforeUndo = await liveRead(page)
    await undo(page)

    await expect(page).toHaveURL(/\/p\/studio\/home$/)
    await batchHandled(page, beforeUndo, 'studio/home/hero')
    await expect(
      page.locator('[data-frame="studio/home/hero"] iframe'),
    ).toBeAttached()
    expect(await frameSources(page)).toEqual(sources)
    expect(await keptFrames(page)).toBe(marked)
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

  test.describe('frames', () => {
    const layout = (page = 'studio/home') =>
      (
        JSON.parse(readFileSync(at(`${page}/layout.json`), 'utf8')) as {
          frames: Record<
            string,
            {
              x: number
              y: number
              width: number
              height: number
              order: number
              hidden?: boolean
              locked?: boolean
            }
          >
        }
      ).frames

    function layers(page: Page) {
      return page.getByRole('region', { name: 'Layers' })
    }

    function layerRow(page: Page, name: string) {
      return layers(page).getByRole('button', {
        name: `Select ${name}`,
        exact: true,
      })
    }

    test('hides, locks, renames, and restacks from the layers list, undoing each on disk', async ({
      page,
    }) => {
      const hero = layout().hero
      await openAsWriter(page)

      await layers(page)
        .getByRole('button', { name: 'Hide hero', exact: true })
        .click()
      await expect.poll(() => layout().hero?.hidden).toBe(true)
      await undo(page)
      await expect.poll(() => layout().hero).toEqual(hero)

      await layers(page)
        .getByRole('button', { name: 'Lock hero', exact: true })
        .click()
      await expect.poll(() => layout().hero?.locked).toBe(true)
      await expect(page.getByRole('img', { name: 'Locked' })).toBeVisible()
      await undo(page)
      await expect.poll(() => layout().hero).toEqual(hero)

      await layerRow(page, 'hero').dblclick()
      await page.keyboard.type('banner')
      await page.keyboard.press('Enter')
      await expect
        .poll(() => existsSync(at('studio/home/banner.html')))
        .toBe(true)
      await undo(page)
      await expect
        .poll(() => existsSync(at('studio/home/hero.html')))
        .toBe(true)

      // The list shows the top of the stack first, so hero, at the bottom, sits last.
      const top = layerRow(page, 'mobile')
      const box = await top.boundingBox()
      if (!box) throw new Error('The mobile row has no box on screen')
      await layerRow(page, 'hero').dragTo(top, {
        targetPosition: { x: box.width / 2, y: 2 },
      })
      await expect.poll(() => layout().hero?.order).toBe(1)
      await undo(page)
      await expect.poll(() => layout().hero?.order).toBe(0)
    })

    test('adds a tablet frame where the Frame tool clicks, and undo takes it away', async ({
      page,
    }) => {
      await openAsWriter(page)

      await page.keyboard.press('f')
      await page.getByRole('radio', { name: /Tablet/ }).click()
      await page
        .locator('[data-hit-layer]')
        .click({ position: { x: 40, y: 40 } })

      await expect
        .poll(() => layout().tablet)
        .toMatchObject({
          width: 834,
          height: 1194,
        })
      await expect(layerRow(page, 'tablet')).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Move', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      const name = page.getByRole('textbox', { name: 'Rename frame tablet' })
      await expect(name).toBeFocused()
      await name.press('Escape')

      await undo(page)

      await expect
        .poll(() => existsSync(at('studio/home/tablet.html')))
        .toBe(false)
    })

    test("cuts a frame and pastes it into another project's page, undoing both", async ({
      page,
    }) => {
      const hero = readFileSync(at('studio/home/hero.html'))
      mkdirSync(at('other/start'), { recursive: true })
      writeFileSync(
        at('other/project.json'),
        '{"version":1,"pages":["start"]}\n',
      )
      writeFileSync(
        at('other/start/layout.json'),
        '{"version":1,"frames":{}}\n',
      )
      await openAsWriter(page)

      await layerRow(page, 'hero').click()
      await page.keyboard.press('ControlOrMeta+KeyX')
      await expect
        .poll(() => existsSync(at('studio/home/hero.html')))
        .toBe(false)

      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await page.getByRole('link', { name: /other/ }).click()
      await expect(page).toHaveURL(/\/p\/other\/start$/)
      await page.keyboard.press('ControlOrMeta+KeyV')

      await expect
        .poll(() => existsSync(at('other/start/hero.html')))
        .toBe(true)
      expect(readFileSync(at('other/start/hero.html'))).toEqual(hero)

      await undo(page)
      await expect
        .poll(() => existsSync(at('other/start/hero.html')))
        .toBe(false)
      await undo(page)
      await expect
        .poll(() => existsSync(at('studio/home/hero.html')))
        .toBe(true)
      expect(readFileSync(at('studio/home/hero.html'))).toEqual(hero)
    })
  })
})
