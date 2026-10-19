import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

const HERO = 'webapp/home/hero'

/** The lines two versions of a file differ on, which a hand edit keeps to the edited element's. */
function changedLines(before: string, after: string): string[] {
  const was = before.split('\n')
  const now = after.split('\n')
  expect(now).toHaveLength(was.length)
  return now.filter((line, index) => line !== was[index])
}

test.describe('editing a selected element by hand', () => {
  let board: FixtureBoard
  let server: BoardServer
  let original: string

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    original = read()
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await selectHeadline(page)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** Cmd-clicks the hero's headline and waits for its sections. */
  async function selectHeadline(page: Page): Promise<void> {
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // The canvas fits the page to the window once its frames have loaded, so
    // a click read off the box before that lands beside the headline.
    await expect(async () => {
      const box = await headline.boundingBox()
      if (!box) throw new Error('the headline has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.up('Meta')
      await expect(page.getByRole('heading', { name: 'Element' })).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })
  }

  test('each edit writes the headline’s span alone, and undo restores the bytes', async ({
    page,
  }) => {
    const headline = original.split('\n').find((line) => line.includes('<h1'))
    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')

    await expect.poll(read).not.toBe(original)
    expect(changedLines(original, read())).toEqual([
      headline?.replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="opacity: 0.5">',
      ),
    ])

    // Cmd+Z in a field undoes its typing, so the board's undo takes focus off it.
    await opacity.blur()
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)
    await expect(page.getByRole('heading', { name: 'Element' })).toBeVisible()

    await page.getByRole('button', { name: 'Fill token' }).click()
    await page.getByRole('menuitem', { name: 'accent' }).click()
    await expect.poll(read).toContain('color: var(--accent)')

    await page.getByRole('button', { name: 'Shadow' }).click()
    await page.getByRole('menuitem', { name: 'shadow-sm' }).click()
    await expect.poll(read).toContain('box-shadow: var(--shadow-sm)')

    const text = page.getByRole('textbox', { name: 'Text' })
    await text.fill('Welcome')
    await text.press('ControlOrMeta+Enter')
    await expect.poll(read).toContain('>Welcome</h1>')
    expect(changedLines(original, read())).toHaveLength(1)

    await text.blur()
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).not.toContain('>Welcome</h1>')
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).not.toContain('box-shadow')
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)
  })

  test('an edit made from bytes an agent has since replaced is refused', async ({
    page,
  }) => {
    // Hold the frame's reload, so the board still names the bytes it showed
    // when the agent's write lands, as it does mid-flight.
    await page.route(
      (url) => url.pathname.startsWith('/frames/'),
      () => {},
    )
    const agent = original.replace('Caption', 'Byline')
    writeFileSync(path(), agent)

    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')

    await expect(page.getByText('Edit not saved')).toBeVisible()
    await expect(opacity).toHaveValue('100%')
    expect(read()).toBe(agent)
  })
})
