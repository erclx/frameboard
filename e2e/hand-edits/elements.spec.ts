import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

  test('Delete takes the selected element out of the file, and undo brings it back', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    const read = () => readFileSync(path, 'utf8')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)

    await cmdClick(page, 'h1')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.keyboard.press('Delete')

    await expect.poll(read).not.toContain('data-name="Headline"')
    expect(read()).toContain('data-name="Caption"')

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toContain('<h1 data-name="Headline">hero</h1>')
  })

  /** Headline and Caption in the order the hero's file holds them. */
  function order(): string[] {
    const html = readFileSync(join(board.root, `${HERO}.html`), 'utf8')
    return html.indexOf('data-name="Headline"') <
      html.indexOf('data-name="Caption"')
      ? ['Headline', 'Caption']
      : ['Caption', 'Headline']
  }

  test('a Layers row dragged above its sibling moves the element in the file, and undo puts it back', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page
      .getByRole('button', { name: 'Show the elements of hero' })
      .click()
    const elements = page.getByRole('list', { name: 'Elements of hero' })
    const headline = elements.getByRole('button', {
      name: 'Headline',
      exact: true,
    })
    const box = await headline.boundingBox()
    if (!box) throw new Error('The Headline row has no box on screen')

    await elements
      .getByRole('button', { name: 'Caption', exact: true })
      .dragTo(headline, { targetPosition: { x: box.width / 2, y: 2 } })

    await expect.poll(order).toEqual(['Caption', 'Headline'])
    await expect(elements.locator('[aria-current="true"]')).toHaveText(
      'Caption',
    )

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(order).toEqual(['Headline', 'Caption'])
  })

  test('Alt+Shift+ArrowDown moves the selected element below its sibling, and undo puts it back', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)

    await cmdClick(page, 'h1')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.keyboard.press('Alt+Shift+ArrowDown')

    await expect.poll(order).toEqual(['Caption', 'Headline'])

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(order).toEqual(['Headline', 'Caption'])
  })

  test('Free places an element in a static parent as two start tags, and one undo takes both back', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    const read = () => readFileSync(path, 'utf8')
    const original = read()
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)

    await cmdClick(page, 'code')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.getByRole('button', { name: 'Free', exact: true }).click()

    await expect
      .poll(read)
      .toContain('<p data-name="Caption" style="position: relative">')
    expect(read()).toMatch(
      /<code data-name="Command" style="font-family: var\(--font-mono\); position: absolute; left: \d+px; top: \d+px[^"]*">/,
    )
    await expect(
      page.getByRole('textbox', { name: 'X position in its parent' }),
    ).toBeVisible()

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toBe(original)
  })
})
