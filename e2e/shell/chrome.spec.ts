import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { liveLayer } from '../support/canvas'

const BOARD = '/p/webapp/home'

function leftPanel(page: Page) {
  return page.getByRole('complementary', { name: 'Pages and layers' })
}

/**
 * Answers -1 while the panel has no box, since a throw would end the
 * `expect.poll` around it at once rather than let it poll again.
 */
async function widthOf(page: Page): Promise<number> {
  const box = await leftPanel(page).boundingBox()
  return box ? Math.round(box.width) : -1
}

/**
 * Wheels down over the panel's middle until `last` stands at its foot, which
 * a short window leaves below the panel until then.
 */
async function wheelTo(
  page: Page,
  panel: Locator,
  last: Locator,
): Promise<void> {
  await expect(last).not.toBeInViewport({ ratio: 1 })
  const box = await panel.boundingBox()
  if (!box) throw new Error('The panel has no box to wheel over')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(async () => {
    await page.mouse.wheel(0, 400)
    await expect(last).toBeInViewport({ ratio: 1, timeout: 200 })
  }).toPass({ timeout: 10_000 })
}

/**
 * How far the panel and everything around it can scroll, 0 when only a body
 * inside it scrolls. Past 0 a wheel slides the panel off the canvas behind it.
 */
function slack(panel: Locator): Promise<number> {
  return panel.evaluate((element) => {
    let most = 0
    for (let box: Element | null = element; box; box = box.parentElement)
      most = Math.max(most, box.scrollHeight - box.clientHeight)
    return most
  })
}

async function edgeCenter(page: Page): Promise<[number, number]> {
  const separator = page.getByRole('separator', {
    name: 'Resize the left panel',
  })
  await expect(separator).toBeVisible()
  const edge = await separator.boundingBox()
  if (!edge) throw new Error('The left panel has no edge to drag')
  return [edge.x + edge.width / 2, edge.y + edge.height / 2]
}

/** Drags the left panel's edge sideways by `dx` pixels. */
async function dragEdge(page: Page, dx: number): Promise<void> {
  const [x, y] = await edgeCenter(page)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
}

test.describe('the board shell', () => {
  test('keeps a resized panel width across a reload', async ({ page }) => {
    await page.goto(BOARD)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)

    await dragEdge(page, 80)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(320)
    await page.reload()

    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(320)
  })

  test('stops a panel at 400 and resets it on a double-click', async ({
    page,
  }) => {
    await page.goto(BOARD)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)

    await dragEdge(page, 400)
    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(400)
    await page.mouse.dblclick(...(await edgeCenter(page)))

    await expect.poll(() => widthOf(page), { timeout: 5_000 }).toBe(240)
  })

  test('opens with its UI hidden on a window under 1024 wide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 })

    await page.goto(BOARD)

    await expect(page.getByRole('button', { name: 'Show UI' })).toBeVisible()
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })
})

test.describe('a side panel taller than the window', () => {
  test.use({ viewport: { width: 1280, height: 300 } })

  test('scrolls Theme under the project name and the tabs, with the panel filling the window', async ({
    page,
  }) => {
    await page.goto(BOARD)
    const panel = leftPanel(page)
    await panel.getByRole('tab', { name: 'Theme' }).click()
    const tokens = panel.getByRole('tabpanel').getByRole('listitem')
    await expect(tokens).not.toHaveCount(0)

    await wheelTo(page, panel, tokens.last())

    expect(await panel.boundingBox()).toMatchObject({ y: 0, height: 300 })
    expect(await slack(panel)).toBe(0)
    await expect(panel.getByRole('button', { name: 'Hide UI' })).toBeInViewport(
      { ratio: 1 },
    )
    await expect(panel.getByRole('tab', { name: 'Theme' })).toBeInViewport({
      ratio: 1,
    })
    await panel.getByRole('tab', { name: 'Design' }).click()
    await expect(panel.getByRole('region', { name: 'Layers' })).toBeVisible()
  })
})

test.describe('the command palette', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('jumps to a frame on another page, selected and in view', async ({
    page,
  }) => {
    await page.goto(`${server.url}/p/studio/home`)
    await expect(page.locator('[data-frame="studio/home/hero"]')).toBeVisible()

    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox').fill('plans')
    await page.keyboard.press('Enter')

    const plans = page.locator('[data-frame="studio/pricing/plans"]')
    await expect(page).toHaveURL(/\/p\/studio\/pricing$/)
    await expect(plans).toHaveAttribute('data-selected', /.*/)
    await expect(plans).toBeInViewport({ ratio: 0.9 })
  })
})

test.describe('Play', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(
      join(board.root, 'webapp/home/hero.html'),
      `<!doctype html><html lang="en"><head><title>hero</title></head><body>
<button type="button" onclick="this.textContent = 'Started'">Get started</button>
<div style="height: 4000px"></div>
</body></html>`,
    )
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('moves the board until a frame is entered, which then takes the wheel and clicks, and Esc leaves it then Play', async ({
    page,
  }) => {
    await page.goto(`${server.url}${BOARD}`)
    const iframe = page.locator('iframe[title="hero"]')
    const hero = page.frameLocator('iframe[title="hero"]')
    const start = hero.getByRole('button', { name: 'Get started' })
    await expect(start).toBeVisible()
    const frame = await (await iframe.elementHandle())?.contentFrame()
    if (!frame) throw new Error('The hero frame has no document')
    const scrollY = () => frame.evaluate(() => window.scrollY)
    const view = () =>
      liveLayer(page).evaluate((layer) => layer.style.transform)
    const tag = page.getByText('In frame, Esc to leave')

    await page.getByRole('button', { name: 'Play' }).click()
    const button = await start.boundingBox()
    if (!button) throw new Error('The hero button is not on screen')
    const at = {
      x: button.x + button.width / 2,
      y: button.y + button.height / 2,
    }
    const before = await view()
    await page.mouse.move(at.x, at.y + 60)
    await page.mouse.wheel(0, 100)
    await expect.poll(view).not.toBe(before)
    expect(await scrollY()).toBe(0)

    const shown = await start.boundingBox()
    if (!shown) throw new Error('The hero button left the screen')
    await page.mouse.click(
      shown.x + shown.width / 2,
      shown.y + shown.height / 2,
    )
    await expect(tag).toBeVisible()
    await expect(start).toBeVisible()
    await start.click()
    await expect(hero.getByRole('button', { name: 'Started' })).toBeVisible()

    const entered = await view()
    await page.mouse.move(shown.x + shown.width / 2, shown.y + 80)
    await page.mouse.wheel(0, 100)
    await expect.poll(scrollY).toBeGreaterThan(0)
    expect(await view()).toBe(entered)

    await page.keyboard.press('Escape')
    await expect(tag).toBeHidden()
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
