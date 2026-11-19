import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Frame, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = '[data-frame="studio/home/hero"] iframe'

/** The writes `frame-isolation.html` sends, each by a script inside the frame. */
const FRAME_WRITES = 22

test.describe("a frame's script against the board", () => {
  let board: FixtureBoard
  let server: BoardServer
  let answers: { path: string; status: number }[]

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('live')
    // The agent's frame, drawn in place of the hero.
    copyFileSync(
      join(
        import.meta.dirname,
        '../../test/fixtures/frames/frame-isolation.html',
      ),
      join(board.root, 'studio/home/hero.html'),
    )
    // A saved kit holding a page of its own, served on the board's port.
    mkdirSync(join(board.root, '.kits/evil'), { recursive: true })
    writeFileSync(join(board.root, '.kits/evil/kit.json'), '{}\n')
    writeFileSync(
      join(board.root, '.kits/evil/notes.html'),
      '<p>Kit notes</p><script>window.ran = true</script>',
    )
    server = await serveBoard(board.root)
    answers = []
    page.on('response', (response) => {
      const request = response.request()
      if (request.method() !== 'POST') return
      if (request.frame() === page.mainFrame()) return
      const url = new URL(response.url())
      if (url.origin !== server.url) return
      answers.push({ path: url.pathname, status: response.status() })
    })
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    await expect(
      page.locator(HERO).contentFrame().locator('body[data-done]'),
    ).toBeAttached({ timeout: 15_000 })
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test("refuses every write the frame posts with the board's cookie", async ({
    page,
  }) => {
    // The board's own write passes, so each refusal is the frame's origin.
    const own = await page.evaluate(
      async () => (await fetch('/api/redo', { method: 'POST' })).status,
    )
    // At least, since a reload of the frame runs its script again.
    await expect.poll(() => answers.length).toBeGreaterThanOrEqual(FRAME_WRITES)

    expect(own).not.toBe(401)
    expect(answers.filter(({ status }) => status !== 401)).toEqual([])
  })

  test('refuses the frame the live socket', async ({ page }) => {
    const body = page.locator(HERO).contentFrame().locator('body')

    await expect(body).toHaveAttribute('data-socket', 'refused')
  })

  test("runs nothing the frame embeds from the board's port on the board's origin", async ({
    page,
  }) => {
    const embedded = (path: string) =>
      expect
        .poll(() => nested(page).find((frame) => frame.url().includes(path)))
        .toBeDefined()
    await embedded('mobile.html')
    await embedded('notes.html')
    const sibling = nested(page).find((frame) =>
      frame.url().includes('mobile.html'),
    )
    const kit = nested(page).find((frame) => frame.url().includes('notes.html'))

    expect(new URL(sibling?.url() ?? '').origin).not.toBe(server.url)
    await expect
      .poll(() => kit?.evaluate(() => document.querySelector('p')?.textContent))
      .toBe('Kit notes')
    expect(
      await kit?.evaluate(() => (window as { ran?: boolean }).ran ?? false),
    ).toBe(false)
  })
})

/** The frames the hero's page embeds, a level below the board's own. */
function nested(page: Page): Frame[] {
  return page
    .frames()
    .filter((frame) => frame.parentFrame()?.parentFrame() === page.mainFrame())
}
