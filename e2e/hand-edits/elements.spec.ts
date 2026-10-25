import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const CLI = resolve('dist/cli.js')
const HERO = 'webapp/home/hero'
const run = promisify(execFile)

interface Selection {
  frames: string[]
  element: { ref: string; index: number; hash: string; name: string } | null
}

test.describe('selecting an element inside a frame', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** What `frameboard selection` reports, the way an agent reads it. */
  async function selection(): Promise<Selection> {
    const { stdout } = await run('node', [
      CLI,
      'selection',
      '--json',
      '--root',
      board.root,
    ])
    return (JSON.parse(stdout) as { data: Selection }).data
  }

  /** Cmd-clicks the hero's element matching `selector`, at its center on screen. */
  async function cmdClick(page: Page, selector: string): Promise<void> {
    const box = await page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator(selector)
      .boundingBox()
    if (!box) throw new Error(`${selector} has no box on screen`)
    await page.keyboard.down('Meta')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.up('Meta')
  }

  test('the board, the verb, and edit agree on one element, and an agent write drops it to the frame', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const outline = page.locator('[data-element-selection]')

    await cmdClick(page, 'h1')

    await expect(outline).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Headline' }),
    ).toHaveAttribute('aria-current', 'true')
    await expect
      .poll(async () => (await selection()).element?.name)
      .toBe('Headline')

    // Tab to the caption, Enter into its command, then Esc twice back to the frame.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => (await selection()).element?.name)
      .toBe('Command')
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await selection()).element?.name)
      .toBe('Caption')
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await selection()).element).toBeNull()
    await expect(outline).toBeHidden()
    expect((await selection()).frames).toEqual([HERO])

    await cmdClick(page, 'h1')
    await expect
      .poll(async () => (await selection()).element?.name)
      .toBe('Headline')
    const { element } = await selection()
    const edit = await run('node', [
      CLI,
      'edit',
      element?.ref ?? '',
      '--index',
      String(element?.index),
      '--hash',
      element?.hash ?? '',
      '--text',
      'Ship it',
      '--json',
      '--root',
      board.root,
    ])

    expect(JSON.parse(edit.stdout)).toMatchObject({ ok: true })
    await expect(
      page.frameLocator(`[data-frame="${HERO}"] iframe`).locator('h1'),
    ).toHaveText('Ship it')
    await expect(outline).toBeHidden()
    await expect.poll(async () => (await selection()).element).toBeNull()
    expect((await selection()).frames).toEqual([HERO])
  })
})
