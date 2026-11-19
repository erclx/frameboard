import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

const HERO = 'webapp/home/hero'
const ROW =
  '<div data-name="Row" style="display: flex; gap: 40px"><div data-name="One" style="width: 80px; height: 40px; background: var(--muted)"></div><div data-name="Two" style="width: 80px; height: 40px; background: var(--muted)"></div></div>'

/** The 5,576 byte phone built by script, which carries no clip. */
const PHONE = readFileSync(resolve('test/fixtures/models/phone.glb'))

const SCRIPT =
  '<script type="module" src="../assets/model-viewer.min.js"></script>'

/**
 * How long a fresh viewer gets to draw. With no GPU, Chromium draws WebGL in
 * software, and one core takes about 6 s to light and compile the first model,
 * holding the frame's thread, and the bridge's replies, until it is done.
 */
const DRAW = { timeout: 20_000 }

/** What a viewer answers once its script drew its model. */
interface Viewer extends HTMLElement {
  loaded?: boolean
  getCameraOrbit?: () => { theta: number }
}

test.describe('a 3D model placed by hand', () => {
  let board: FixtureBoard
  let server: BoardServer

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')
  const tools = (page: Page) => page.getByRole('toolbar', { name: 'Tools' })
  const hero = (page: Page) =>
    page.frameLocator(`[data-frame="${HERO}"] iframe`)
  const viewer = (page: Page) => hero(page).locator('model-viewer')
  /** The angle across the file states, or null before a turn writes one. */
  const turned = () => {
    const stated = /camera-orbit="(-?\d+)deg 75deg auto"/.exec(read())
    return stated?.[1] === undefined ? null : Number(stated[1])
  }

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    writeFileSync(path(), read().replace('</h1>', `</h1>\n    ${ROW}`))
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('journey: a dropped model places as a viewer, turns by drag, keeps its angle through a reload, and one undo puts it back', async ({
    page,
  }) => {
    // Two fresh draws, at placing and after the reload, near 20 s on one core.
    test.slow()
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page.getByRole('tab', { name: 'Assets' }).click()
    await expect(page.getByText('assets/ · 0 files')).toBeVisible()

    await page.evaluate(
      (bytes) => {
        const transfer = new DataTransfer()
        transfer.items.add(
          new File([new Uint8Array(bytes)], 'phone.glb', {
            type: 'model/gltf-binary',
          }),
        )
        document.querySelector('[aria-busy]')?.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: transfer,
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      [...PHONE],
    )
    await expect(page.getByText('assets/ · 1 file')).toBeVisible()

    const one = await hero(page).locator('[data-name="One"]').boundingBox()
    if (!one) throw new Error('The row draws no first child')
    await tools(page).getByRole('button', { name: 'Shapes' }).click()
    await page
      .getByRole('menuitem', { name: /Image, video, audio, or model/ })
      .click()
    await page.getByRole('button', { name: 'Place phone.glb' }).click()
    await page.mouse.click(one.x + one.width + 20, one.y + one.height / 2)

    await expect
      .poll(read)
      .toContain(
        '<model-viewer data-name="phone.glb" src="../assets/phone.glb" alt="" style="width: 240px; height: 135px"></model-viewer>',
      )
    expect(read().split(SCRIPT)).toHaveLength(2)
    expect(
      existsSync(join(board.root, 'webapp/assets/model-viewer.min.js')),
    ).toBe(true)
    const section = page.getByRole('region', { name: 'Model' })
    await expect(section.getByText('phone.glb')).toBeVisible(DRAW)
    await expect
      .poll(
        () => viewer(page).evaluate((node: Viewer) => node.loaded === true),
        DRAW,
      )
      .toBe(true)
    const placed = read()

    const box = await viewer(page).boundingBox()
    if (!box) throw new Error('The placed model draws no box')
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.dblclick(center.x, center.y)
    const chip = page.getByText('Turning, Esc to leave')
    await expect(chip).toBeVisible()
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    // An eighth of the model's height on screen, so an eighth of a turn whatever the zoom.
    await page.mouse.move(center.x + box.height / 8, center.y, { steps: 6 })
    await page.mouse.up()

    await expect.poll(turned).toBeLessThan(0)
    const angle = turned()
    expect(angle).toBeGreaterThan(-90)
    expect(read()).toContain(
      `camera-orbit="${angle}deg 75deg auto" max-camera-orbit="auto auto auto"`,
    )
    await expect(
      section.getByRole('textbox', { name: 'Camera around' }),
    ).toHaveValue(`${angle}°`)
    // Turn mode holds through the write, so a second drag needs no second double-click.
    await expect(chip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(chip).toBeHidden()
    await expect(section).toBeVisible()

    await page.reload()
    await expect
      .poll(
        () =>
          viewer(page).evaluate((node: Viewer) =>
            node.loaded === true && node.getCameraOrbit
              ? Math.round((node.getCameraOrbit().theta * 180) / Math.PI)
              : null,
          ),
        DRAW,
      )
      .toBe(angle)

    await undo(page)
    await expect.poll(read).toBe(placed)
  })
})
