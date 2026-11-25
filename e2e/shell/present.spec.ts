import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

import { shippedViewerPath } from '@/server/models/viewer'
import { VIEWER_FILE } from '@/shared/model-viewer'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { undo } from '../support/history'

const BOARD = '/p/webapp/home'
const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

let board: FixtureBoard
let server: BoardServer

/**
 * `hero` sits at x 0 and `about` at x 1520 on one row, and a hidden `draft`
 * sits past both, so the page presents `hero` then `about`.
 */
test.beforeEach(async () => {
  board = copyFixtureBoard('basic')
  const page = join(board.root, 'webapp/home')
  const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
  layout.frames.draft = {
    x: 2000,
    y: 0,
    width: 390,
    height: 844,
    order: 2,
    hidden: true,
    locked: false,
  }
  writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))
  writeFileSync(
    join(page, 'draft.html'),
    '<!doctype html><title>draft</title><p>draft</p>',
  )
  server = await serveBoard(board.root)
})

test.afterEach(async () => {
  await server.stop()
  board.cleanup()
})

const presenting = (page: Page) =>
  page.getByRole('dialog', { name: /^Presenting/ })
const shown = (page: Page) => presenting(page).locator('iframe')
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Presenting' })

async function open(page: Page) {
  await page.goto(`${server.url}${BOARD}`)
  await expect(
    page.locator('[data-frame="webapp/home/hero"] iframe'),
  ).toBeVisible()
}

test.describe('presenting a page', () => {
  test('steps by key and leaves on Esc with the frame selected', async ({
    page,
  }) => {
    await open(page)

    await page.getByRole('button', { name: 'Present page' }).click()
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await page.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await page.keyboard.press('Space')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await expect(bar(page)).toContainText('2 / 2')

    await page.keyboard.press('Escape')

    await expect(presenting(page)).toHaveCount(0)
    await expect(
      page.locator('[data-frame="webapp/home/about"][data-selected]'),
    ).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: 'Present page' }),
    ).toBeFocused()
    // Tooltips open with no delay, so one would already show here.
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)
  })

  test('steps and leaves from the bar a pointer move shows', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await page.mouse.move(200, 200)
    await page.mouse.move(220, 210)
    await bar(page).getByRole('button', { name: 'Next frame' }).click()
    await expect(shown(page)).toHaveAttribute('title', 'about')
    await bar(page).getByRole('button', { name: 'Leave presenting' }).click()

    await expect(presenting(page)).toHaveCount(0)
  })

  test('steps by key with focus inside the presented frame', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(shown(page)).toHaveAttribute('title', 'hero')

    await shown(page).click()
    await page.keyboard.press('ArrowRight')

    await expect(shown(page)).toHaveAttribute('title', 'about')
  })

  test('keeps the board keys from the board while presenting', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(presenting(page)).toBeVisible()
    // Off the overlay, where the registry's own dialog skip no longer covers the press.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })

    await page.keyboard.press('ControlOrMeta+k')

    await expect(
      page.getByRole('dialog', { name: 'Command palette' }),
    ).toHaveCount(0)
  })
})

test.describe('a phone frame as tall as its page', () => {
  /** Turns `about` into a phone frame 2454 tall, its page 2400 under the status bar. */
  test.beforeEach(async () => {
    const folder = join(board.root, 'webapp/home')
    const layout = JSON.parse(readFileSync(join(folder, 'layout.json'), 'utf8'))
    layout.frames.about = {
      ...layout.frames.about,
      height: 2454,
      showDevice: true,
    }
    writeFileSync(join(folder, 'layout.json'), JSON.stringify(layout))
    writeFileSync(
      join(folder, 'about.html'),
      '<!doctype html><title>about</title><body style="margin:0"><div style="height:2400px;background:linear-gradient(#fde,#def)">about</div></body>',
    )
    await server.stop()
    server = await serveBoard(board.root)
  })

  test('presents it one screen tall and scrolls its page under the wheel', async ({
    page,
  }) => {
    await open(page)
    await page.keyboard.press('Shift+P')
    await page.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveAttribute('title', 'about')
    const scrollY = () =>
      shown(page)
        .contentFrame()
        .locator('html')
        .evaluate(() => window.scrollY)
    // The page stands under the 54 tall status bar on an 844 tall screen.
    await expect
      .poll(() =>
        shown(page).evaluate((frame: HTMLIFrameElement) => frame.offsetHeight),
      )
      .toBe(790)
    await expect.poll(scrollY).toBe(0)

    await shown(page).hover()
    await page.mouse.wheel(0, 400)

    await expect.poll(scrollY).toBeGreaterThan(0)
    await expect(shown(page)).toHaveAttribute('title', 'about')
  })
})

test.describe('a deck with a transition and a stepped slide', () => {
  // A fading deck reading hero, about with two steps, then closing.
  test.beforeEach(() => {
    const page = join(board.root, 'webapp/home')
    const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
    layout.present = { transition: { name: 'fade', ms: 200 } }
    layout.frames.closing = {
      x: 3000,
      y: 0,
      width: 390,
      height: 844,
      order: 3,
    }
    writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))
    writeFileSync(
      join(page, 'about.html'),
      '<!doctype html><title>about</title><h1>about</h1>' +
        '<p id="one" data-step="1">One</p>' +
        '<p id="two" data-step="2" data-step-effect="fade">Two</p>',
    )
    writeFileSync(
      join(page, 'closing.html'),
      '<!doctype html><title>closing</title><p>closing</p>',
    )
  })

  const arriving = (page: Page) =>
    presenting(page).locator('[data-present-layer="enter"] iframe')
  const step = (page: Page, id: string) =>
    arriving(page).contentFrame().locator(`#${id}`)

  test('reveals the stepped slide one press at a time and shows every step in Edit', async ({
    page,
  }) => {
    await open(page)
    const onCanvas = page
      .locator('[data-frame="webapp/home/about"] iframe')
      .contentFrame()
    await expect(onCanvas.locator('#two')).toBeVisible()
    await page.keyboard.press('Shift+P')
    await expect(arriving(page)).toHaveAttribute('title', 'hero')

    await page.keyboard.press('ArrowRight')
    await expect(arriving(page)).toHaveAttribute('title', 'about')
    await expect(
      bar(page).getByRole('img', { name: 'Step 0 of 2' }),
    ).toBeAttached()
    await expect(step(page, 'one')).toBeHidden()

    await page.keyboard.press('ArrowRight')
    await expect(step(page, 'one')).toBeVisible()
    await expect(step(page, 'two')).toBeHidden()
    await page.keyboard.press('ArrowRight')
    await expect(step(page, 'two')).toBeVisible()
    await expect(arriving(page)).toHaveAttribute('title', 'about')

    await page.keyboard.press('ArrowRight')

    await expect(arriving(page)).toHaveAttribute('title', 'closing')
    await expect(bar(page)).toContainText('3 / 3')
  })

  test('jumps mid-deck from the overview, landing on a slide at its first step', async ({
    page,
  }) => {
    const overview = page.getByRole('region', { name: 'Slide overview' })
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(arriving(page)).toHaveAttribute('title', 'hero')
    await page.keyboard.press('ArrowRight')
    await expect(
      bar(page).getByRole('img', { name: 'Step 0 of 2' }),
    ).toBeAttached()
    await page.keyboard.press('ArrowRight')
    await expect(step(page, 'one')).toBeVisible()

    await page.keyboard.press('g')
    await expect(
      overview.getByRole('button', { name: 'Slide 2, about' }),
    ).toHaveAttribute('aria-current', 'true')
    await page.keyboard.press('3')
    await page.keyboard.press('Enter')

    await expect(overview).toHaveCount(0)
    await expect(arriving(page)).toHaveAttribute('title', 'closing')
    await expect(presenting(page).locator('iframe')).toHaveCount(1)

    await page.keyboard.press('g')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')

    await expect(arriving(page)).toHaveAttribute('title', 'about')
    await expect(
      bar(page).getByRole('img', { name: 'Step 0 of 2' }),
    ).toBeAttached()
    await expect(step(page, 'one')).toBeHidden()
  })
})

test.describe("a transition of the project's own", () => {
  // The suite runs with motion reduced, which cuts every transition.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('plays the keyframes of a file an agent wrote and set by name', async ({
    page,
  }) => {
    const folder = join(board.root, 'webapp/assets/transitions')
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, 'wipe.css'),
      '@keyframes enter { from { clip-path: inset(0 0 0 100%) } to { clip-path: inset(0) } }',
    )
    await run('node', [
      CLI,
      'page',
      'transition',
      'webapp/home',
      'wipe',
      '--ms',
      '4000',
      '--root',
      board.root,
      '--json',
    ])
    await open(page)
    await page.keyboard.press('Shift+P')
    await expect(page.locator('style[data-own-transitions]')).toBeAttached()

    await page.keyboard.press('ArrowRight')

    const arriving = presenting(page).locator('[data-present-layer="enter"]')
    await expect(arriving).toHaveAttribute('data-transition', 'wipe')
    await expect(arriving).toHaveCSS(
      'animation-name',
      'fb-own-webapp--wipe-enter',
    )
    expect(
      await arriving.evaluate((layer) => layer.getAnimations().length),
    ).toBe(1)
  })
})

test.describe('a slide tuned by hand', () => {
  // The suite runs with motion reduced, under which no step moves or waits.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  /** How long a fresh viewer gets to draw, since with no GPU Chromium compiles the first model in software. */
  const DRAW = { timeout: 20_000 }

  const path = () => join(board.root, 'webapp/home/about.html')
  const read = () => readFileSync(path(), 'utf8')
  const inPresent = (page: Page, selector: string) =>
    shown(page).contentFrame().locator(selector)
  const steps = (page: Page) => page.getByRole('region', { name: 'Steps' })

  async function selectAbout(page: Page) {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}${BOARD}`)
    await page.getByRole('button', { name: 'Select about' }).click()
    await page.getByRole('tab', { name: 'Slides' }).click()
  }

  test('reorders in one undo and presents each step at its own length and delay', async ({
    page,
  }) => {
    writeFileSync(
      path(),
      '<!doctype html><html><head><title>about</title></head><body>' +
        '<p id="one" data-step="1" data-step-effect="fade">One</p>' +
        '<p id="two" data-step="2" data-step-effect="fly">Two</p>' +
        '<p id="three" data-step="5" data-step-effect="wipe">Three</p></body></html>',
    )
    const before = read()
    await selectAbout(page)
    const row = (name: string) =>
      steps(page).getByRole('button', { name: new RegExp(`^${name},`) })

    await row('Three').dragTo(row('One'), { targetPosition: { x: 20, y: 4 } })

    await expect.poll(read).toContain('id="three" data-step="1"')
    expect(read()).toContain('id="one" data-step="2"')
    expect(read()).toContain('id="two" data-step="3"')
    await undo(page)
    await expect.poll(read).toBe(before)

    await row('One').click()
    const duration = page.getByRole('textbox', { name: 'Duration' })
    await duration.fill('900')
    await duration.press('Enter')
    await expect.poll(read).toContain('data-step-duration="900"')
    const delay = page.getByRole('textbox', { name: 'Delay' })
    await delay.fill('250')
    await delay.press('Enter')
    await expect.poll(read).toContain('data-step-delay="250"')

    await page.getByRole('button', { name: 'Present page' }).click()
    await expect(
      bar(page).getByRole('img', { name: 'Step 0 of 3' }),
    ).toBeAttached()
    await page.keyboard.press('ArrowRight')

    await expect(inPresent(page, '#one')).toHaveCSS(
      'animation-duration',
      '0.9s',
    )
    await expect(inPresent(page, '#one')).toHaveCSS('animation-delay', '0.25s')
  })

  test('starts a video and a model’s clip on their presses and rests them on a step back', async ({
    page,
  }) => {
    test.slow()
    const assets = join(board.root, 'webapp/assets')
    mkdirSync(assets, { recursive: true })
    copyFileSync(
      resolve('test/fixtures/media/clip.webm'),
      join(assets, 'clip.webm'),
    )
    copyFileSync(
      resolve('test/fixtures/models/spin.glb'),
      join(assets, 'spin.glb'),
    )
    copyFileSync(shippedViewerPath(), join(assets, VIEWER_FILE))
    writeFileSync(
      path(),
      '<!doctype html><html><head><title>about</title>' +
        `<script type="module" src="../assets/${VIEWER_FILE}"></script></head><body>` +
        '<video data-step="1" data-step-effect="fade" data-step-play loop src="../assets/clip.webm" style="width: 160px; height: 90px"></video>' +
        '<model-viewer data-step="2" data-step-play src="../assets/spin.glb" style="display: block; width: 160px; height: 160px"></model-viewer></body></html>',
    )
    await selectAbout(page)
    await page.getByRole('button', { name: 'Present page' }).click()
    const video = inPresent(page, 'video')
    const model = inPresent(page, 'model-viewer')
    const clip = (node: Element) => {
      const { paused, currentTime } = node as HTMLMediaElement
      return { paused, started: currentTime > 0 }
    }
    const loaded = (node: Element) =>
      (node as Element & { loaded?: boolean }).loaded
    await expect.poll(() => model.evaluate(loaded), DRAW).toBe(true)
    expect(await video.evaluate(clip)).toEqual({ paused: true, started: false })

    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => video.evaluate(clip))
      .toEqual({ paused: false, started: true })
    expect(await model.evaluate(clip)).toEqual({ paused: true, started: false })

    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => model.evaluate(clip), DRAW)
      .toEqual({ paused: false, started: true })

    await page.keyboard.press('ArrowLeft')
    await expect
      .poll(() => model.evaluate(clip))
      .toEqual({ paused: true, started: false })
    await page.keyboard.press('ArrowLeft')
    await expect
      .poll(() => video.evaluate(clip))
      .toEqual({ paused: true, started: false })
  })
})
