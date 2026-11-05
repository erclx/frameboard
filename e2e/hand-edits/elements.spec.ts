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

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The hero element's box once two reads a frame apart agree. A write reloads
 * the frame's iframe, and a read taken mid-reload is null or the box of the
 * document about to be replaced.
 */
async function settledBox(page: Page, selector: string): Promise<Box> {
  const target = page
    .frameLocator(`[data-frame="${HERO}"] iframe`)
    .locator(selector)
  let settled: Box | null = null
  await expect
    .poll(
      async () => {
        const first = await target.boundingBox()
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(done)),
        )
        const second = await target.boundingBox()
        const agree =
          first !== null &&
          second !== null &&
          first.x === second.x &&
          first.y === second.y &&
          first.width === second.width &&
          first.height === second.height
        settled = agree ? second : null
        return agree
      },
      { message: `${selector} has no settled box on screen`, timeout: 10_000 },
    )
    .toBe(true)
  if (!settled) throw new Error(`${selector} has no box on screen`)
  return settled
}

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
    const box = await settledBox(page, selector)
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
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled()

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
    await page
      .getByRole('group', { name: 'Placement' })
      .getByRole('button', { name: 'Free', exact: true })
      .click()

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

  test('Shift-click selects two elements, Free places both, and one undo takes them back', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    const read = () => readFileSync(path, 'utf8')
    const original = read()
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const outlines = page.locator('[data-element-selection]')

    await cmdClick(page, 'h1')
    await expect(outlines).toHaveCount(1)
    const caption = await page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('p')
      .boundingBox()
    if (!caption) throw new Error('the caption has no box on screen')
    await page.keyboard.down('Shift')
    await page.mouse.click(
      caption.x + caption.width / 2,
      caption.y + caption.height / 2,
    )
    await page.keyboard.up('Shift')

    await expect(outlines).toHaveCount(2)
    await expect(
      page.getByRole('heading', { name: '2 elements' }),
    ).toBeVisible()
    await page
      .getByRole('group', { name: 'Placement' })
      .getByRole('button', { name: 'Free', exact: true })
      .click()

    await expect.poll(() => read().match(/position: absolute/g)).toHaveLength(2)
    await expect(outlines).toHaveCount(2)

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toBe(original)
  })

  test('a marquee from the selected frame’s bare body selects what it touches, and Delete takes them out', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    const read = () => readFileSync(path, 'utf8')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const hero = page.locator(`[data-frame="${HERO}"]`)
    const box = await hero.boundingBox()
    if (!box) throw new Error('the hero has no box on screen')
    const headline = await page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
      .boundingBox()
    if (!headline) throw new Error('the headline has no box on screen')
    const bare = { x: box.x + box.width / 2, y: box.y + box.height - 8 }

    await page.mouse.click(bare.x, bare.y)
    await page
      .getByRole('button', { name: 'Show the elements of hero' })
      .click()
    await expect(
      page.getByRole('list', { name: 'Elements of hero' }),
    ).toBeVisible()
    await page.mouse.move(bare.x, bare.y)
    await page.mouse.down()
    await page.mouse.move(bare.x - 20, headline.y + 2, { steps: 4 })
    await page.mouse.up()

    await expect(page.locator('[data-element-selection]')).toHaveCount(2)
    await page.keyboard.press('Delete')

    await expect.poll(read).not.toContain('data-name="Headline"')
    expect(read()).not.toContain('data-name="Caption"')
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(read).toContain('data-name="Headline"')
    expect(read()).toContain('data-name="Caption"')
  })

  test('a note pinned on an element stays on it through a fill change and an insert before it, and through both undos', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    const read = () => readFileSync(path, 'utf8')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    // The basic board pins its second note on the hero's h1, at index 5.
    const pin = page.getByRole('button', { name: 'Note 2 on hero' })
    await expect(pin).toHaveAttribute('data-note-element', '5')

    await cmdClick(page, 'h1')
    await page.getByRole('button', { name: 'Fill token' }).click()
    await page
      .getByRole('list', { name: 'Fill tokens' })
      .getByRole('button', { name: 'accent' })
      .click()
    await expect.poll(read).toContain('color: var(--accent)')
    await expect(pin).toHaveAttribute('data-note-element', '5')

    const headline = await settledBox(page, 'h1')
    await page
      .getByRole('toolbar', { name: 'Tools' })
      .getByRole('button', { name: 'Rectangle' })
      .click()
    // In the body's padding just above the headline, so the gap before it.
    await page.mouse.click(headline.x + headline.width / 2, headline.y - 4)
    await expect.poll(read).toContain('data-name="Rectangle"')
    await expect(pin).toHaveAttribute('data-note-element', '6')

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(read).not.toContain('data-name="Rectangle"')
    await expect(pin).toHaveAttribute('data-note-element', '5')

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(read).not.toContain('color: var(--accent)')
    await expect(pin).toHaveAttribute('data-note-element', '5')
  })
})
