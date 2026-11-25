import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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
  getCameraOrbit?: () => { theta: number; radius: number }
  getFieldOfView?: () => number
  getDimensions?: () => { x: number; y: number; z: number }
  getCameraTarget?: () => { z: number }
}

/** What a drawn viewer shows: its camera's distance, view, and target, and the model's size, or null before it draws. */
function drawn(node: Viewer) {
  if (!node.loaded) return null
  return [
    node.getCameraOrbit?.().radius,
    node.getFieldOfView?.(),
    node.getCameraTarget?.().z,
    node.getDimensions?.().x,
    node.getDimensions?.().y,
  ].map((value) => Number((value ?? 0).toFixed(1)))
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
    const section = page.getByRole('region', { name: 'Camera' })
    await expect(section).toBeVisible(DRAW)
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
    await page.mouse.move(center.x + 60, center.y, { steps: 6 })
    await page.mouse.up()

    // Half a degree a pixel, whatever the model's size and the zoom.
    const angle = -30
    await expect.poll(turned).toBe(angle)
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

  test('journey: a placed model sizes, moves nearer, moves, and turns, holds through a reload, and one undo each puts it back', async ({
    page,
  }) => {
    // Each reload draws the model afresh, near 10 s on one core.
    test.slow()
    const assets = join(board.root, 'webapp/assets')
    mkdirSync(assets, { recursive: true })
    writeFileSync(join(assets, 'phone.glb'), PHONE)
    copyFileSync(
      resolve('dist/viewer/model-viewer.min.js'),
      join(assets, 'model-viewer.min.js'),
    )
    writeFileSync(
      path(),
      read()
        .replace('</head>', `${SCRIPT}</head>`)
        .replace(
          ROW,
          '<model-viewer data-name="Phone" src="../assets/phone.glb" alt="" style="position: absolute; left: 40px; top: 160px; width: 640px; height: 480px"></model-viewer>',
        ),
    )
    const rest = read()
    const steps = [rest]
    /** Waits for one write and keeps the file it left. */
    const written = async (holds: RegExp) => {
      await expect.poll(read).toMatch(holds)
      steps.push(read())
    }
    const pick = async () => {
      const section = page.getByRole('region', { name: 'Transform' })
      await expect(async () => {
        const box = await viewer(page).boundingBox()
        if (!box) throw new Error('The model draws no box')
        await page.mouse.dblclick(box.x + box.width / 4, box.y + box.height / 4)
        await expect(section).toBeVisible({ timeout: 2000 })
      }).toPass(DRAW)
      await expect(tip('z')).toBeVisible(DRAW)
      return section
    }
    const tip = (axis: string) =>
      page.locator(`[data-model-handle="${axis}"] [data-model-handle-tip]`)
    const mode = (name: string) =>
      page
        .getByRole('group', { name: 'Model handles' })
        .getByRole('button', { name })
        .click()
    const drag = async (axis: string, dx: number, dy: number) => {
      const box = await tip(axis).boundingBox()
      if (!box) throw new Error(`No ${axis} handle`)
      const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + dx, at.y + dy, { steps: 6 })
      await page.mouse.up()
    }
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await expect.poll(() => viewer(page).evaluate(drawn), DRAW).not.toBeNull()
    const section = await pick()

    await mode('Size')
    await drag('x', 25, 0)
    await written(/scale="1.5 1.5 1.5"/)
    expect(read()).toMatch(/camera-orbit="0deg 75deg [\d.]+m"/)

    const depth = section.getByRole('textbox', { name: /^Z/ })
    await depth.fill('0.5')
    await depth.press('Enter')
    await written(/camera-target="auto auto -?[\d.]+m"/)

    const shown = await viewer(page).evaluate(drawn)
    expect(shown?.[4]).toBeCloseTo(2.3, 1)
    await page.reload()
    await expect.poll(() => viewer(page).evaluate(drawn), DRAW).toEqual(shown)
    await pick()

    await mode('Move')
    await drag('x', 40, 0)
    await written(/left: (?!40px)\d+px; top: 160px/)

    await mode('Turn')
    await drag('y', 60, 0)
    await written(/orientation="0deg 0deg 30deg"/)

    for (const before of steps.slice(0, -1).toReversed()) {
      await undo(page)
      await expect.poll(read).toBe(before)
    }
  })
})
