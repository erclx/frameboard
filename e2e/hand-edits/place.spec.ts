import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = 'webapp/home/hero'
const ROW =
  '<div data-name="Row" style="display: flex; gap: 40px"><div data-name="One" style="width: 80px; height: 40px; background: var(--muted)"></div><div data-name="Two" style="width: 80px; height: 40px; background: var(--muted)"></div></div>'

test.describe('placing text and shapes into a frame', () => {
  let board: FixtureBoard
  let server: BoardServer

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    // A flex row under the headline, whose gap a shape lands in.
    writeFileSync(path(), read().replace('</h1>', `</h1>\n    ${ROW}`))
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** The hash of the bytes the hero's iframe shows, off the stamp the frame route puts on it. */
  const shownHash = (page: Page) =>
    hero(page).locator('style[data-frameboard]').getAttribute('data-hash')
  const tools = (page: Page) => page.getByRole('toolbar', { name: 'Tools' })
  const hero = (page: Page) =>
    page.frameLocator(`[data-frame="${HERO}"] iframe`)

  /** The screen point at the center of the hero's element matching `selector`. */
  async function centerOf(page: Page, selector: string) {
    const box = await hero(page).locator(selector).boundingBox()
    if (!box) throw new Error(`${selector} has no box on screen`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  test('a rectangle lands between two children of a row as one tag, is selected, and undoes', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const original = read()
    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')

    await tools(page).getByRole('button', { name: 'Rectangle' }).click()
    // In the 40px gap past the first child, on the row's own background.
    await page.mouse.click(one.x + one.width + 20, one.y + one.height / 2)

    await expect
      .poll(read)
      .toBe(
        original.replace(
          '<div data-name="Two"',
          '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div><div data-name="Two"',
        ),
      )
    await expect(
      tools(page).getByRole('button', { name: 'Rectangle' }),
    ).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-element-selection]')).toBeVisible()

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toBe(original)
  })

  test('a desktop frame placed by hand keeps its 900 height once a rectangle lands in it', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const below = await page.locator(`[data-frame="${HERO}"]`).boundingBox()
    if (!below) throw new Error('The hero draws no box')

    await tools(page).getByRole('button', { name: 'Frame' }).click()
    await page.mouse.click(below.x + 10, below.y + below.height + 80)
    await page.keyboard.press('Enter')
    const desktop = page.frameLocator(
      '[data-frame="webapp/home/desktop"] iframe',
    )
    const body = await desktop.locator('body').boundingBox()
    if (!body) throw new Error('The new frame draws no body')
    await tools(page).getByRole('button', { name: 'Rectangle' }).click()
    await page.mouse.click(body.x + 40, body.y + 40)

    const added = join(board.root, 'webapp/home/desktop.html')
    await expect
      .poll(() => readFileSync(added, 'utf8'))
      .toContain('data-name="Rectangle"')
    const layout = () =>
      JSON.parse(
        readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
      ).frames.desktop
    await expect
      .poll(layout)
      .toMatchObject({ width: 1440, height: 900, hugHeight: false })
  })

  test('Layers lists a Text placed between two placed rectangles at once, highlighting it', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const elements = page.getByRole('list', { name: 'Elements of hero' })
    const rectangles = elements.getByRole('button', { name: 'Rectangle' })
    /** The 40px row gap just past the hero's first element named `name`, level with One. */
    async function gapAfter(name: string) {
      const [box, one] = await Promise.all([
        hero(page).locator(`[data-name="${name}"]`).first().boundingBox(),
        hero(page).locator('[data-name="One"]').boundingBox(),
      ])
      if (!box || !one) throw new Error(`${name} has no box on screen`)
      return { x: box.x + box.width + 20, y: one.y + one.height / 2 }
    }
    async function place(tool: string, at: { x: number; y: number }) {
      await tools(page).getByRole('button', { name: tool }).click()
      await page.mouse.click(at.x, at.y)
    }

    await place('Rectangle', await gapAfter('One'))
    await expect(rectangles).toHaveCount(1)
    await place('Rectangle', await gapAfter('Rectangle'))
    await expect(rectangles).toHaveCount(2)
    await place('Text', await gapAfter('Rectangle'))

    await expect(elements.locator('[aria-current="true"]')).toHaveText('Text')
    await expect(
      elements.getByRole('button', { name: /^(One|Rectangle|Text|Two)$/ }),
    ).toHaveText(['One', 'Rectangle', 'Text', 'Rectangle', 'Two'])
  })

  test('a shape picked from the Shapes menu lands on the first click', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')

    await tools(page).getByRole('button', { name: 'Shapes' }).click()
    await page.getByRole('menuitemradio', { name: /Ellipse/ }).click()
    await page.mouse.click(one.x + one.width + 20, one.y + one.height / 2)

    await expect.poll(read).toContain('data-name="Ellipse"')
  })

  test('a Rectangle drag writes the size it drew, landing where it started, and a 2px drag stays a click', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')
    const zoom = await page
      .locator('[data-layer]')
      .evaluate((layer) => Number(layer.style.getPropertyValue('--zoom')) || 1)
    const start = { x: one.x + one.width + 20, y: one.y + one.height / 2 }

    await tools(page).getByRole('button', { name: 'Rectangle' }).click()
    await page.mouse.move(start.x, start.y)
    const line = page.locator('[data-drop-line]')
    await expect(line).toBeVisible()
    const pressed = await line.boundingBox()
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y + 30, { steps: 4 })
    await expect(page.locator('[data-shape-draft]')).toBeVisible()
    await page.mouse.move(start.x + 120, start.y + 60, { steps: 4 })
    // The line stays at the gap the shape lands in, not under the pointer.
    expect(await line.boundingBox()).toEqual(pressed)
    await page.mouse.up()

    await expect.poll(read).toMatch(/data-name="Rectangle" style="width: \d+px/)
    const [, width, height] =
      /data-name="Rectangle" style="width: (\d+)px; height: (\d+)px/.exec(
        read(),
      ) ?? []
    expect(Number(width)).toBeCloseTo(120 / zoom, -0.5)
    expect(Number(height)).toBeCloseTo(60 / zoom, -0.5)
    expect(read()).toContain('></div><div data-name="Two"')
    await expect(page.locator('[data-shape-draft]')).toHaveCount(0)

    await tools(page).getByRole('button', { name: 'Rectangle' }).click()
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 2, start.y)
    await page.mouse.up()

    await expect
      .poll(read)
      .toContain(
        '<div data-name="Rectangle" style="width: 100px; height: 100px;',
      )
  })

  test('a drag on a selected element moves it past its sibling in the file, the frame stays, and undo moves it back', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const original = read()
    const layout = join(board.root, 'webapp/home/layout.json')
    const placed = readFileSync(layout, 'utf8')
    const one = await centerOf(page, '[data-name="One"]')
    const two = await hero(page).locator('[data-name="Two"]').boundingBox()
    if (!two) throw new Error('The row draws no second child')

    await page.keyboard.down('Meta')
    await page.mouse.click(one.x, one.y)
    await page.keyboard.up('Meta')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.mouse.move(one.x, one.y)
    await page.mouse.down()
    // Past the second child's middle, so the gap is the row's end.
    const drop = { x: two.x + two.width - 10, y: two.y + two.height / 2 }
    await page.mouse.move(drop.x, drop.y, { steps: 8 })
    await expect(page.locator('[data-drop-line]')).toBeVisible()
    await page.mouse.up()

    const ONE =
      '<div data-name="One" style="width: 80px; height: 40px; background: var(--muted)"></div>'
    const TWO =
      '<div data-name="Two" style="width: 80px; height: 40px; background: var(--muted)"></div>'
    await expect.poll(read).toContain(`${TWO}${ONE}</div>`)
    expect(readFileSync(layout, 'utf8')).toBe(placed)
    await expect(page.locator('[data-element-selection]')).toBeVisible()

    await page.keyboard.press('ControlOrMeta+z')

    await expect.poll(read).toBe(original)
  })

  test('a placed Text opens for typing, and a double-click on a selected text element edits it the same way', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    const headline = await centerOf(page, 'h1')

    await tools(page).getByRole('button', { name: 'Text' }).click()
    // On the headline's lower half, so the Text lands between it and the row.
    await page.mouse.click(headline.x, headline.y + 8)
    await expect(hero(page).locator('[data-name="Text"]')).toBeFocused()
    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')

    await expect
      .poll(read)
      .toContain(
        '</h1>\n    <p data-name="Text" style="font-family: var(--font-text)">Hello</p><div data-name="Row"',
      )

    // The pick vouches only for bytes the frame shows, so it waits out the reload.
    await expect
      .poll(() => shownHash(page))
      .toBe(createHash('sha256').update(read()).digest('hex'))
    await page.keyboard.down('Meta')
    await page.mouse.click(headline.x, headline.y)
    await page.keyboard.up('Meta')
    await expect(page.locator('[data-element-selection]')).toBeVisible()
    await page.mouse.dblclick(headline.x, headline.y)
    await expect(hero(page).locator('h1')).toBeFocused()
    await page.keyboard.type('Welcome')
    await page.keyboard.press('Enter')

    await expect.poll(read).toContain('<h1 data-name="Headline">Welcome</h1>')
  })
})
