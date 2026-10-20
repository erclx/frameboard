import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium, expect, type Page } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type TempBoard, writeBoard } from '../test/support/temp-board'
import { type BoardServer, serveBoard } from './support/board-server'

/**
 * Captures each shell surface at the 1440 by 900 the references under
 * `canon/design/` were drawn at, light and dark, into
 * `screenshots/compare/`, for a pull request to set beside its reference.
 * It serves its own boards from the built CLI, since the empty page and the
 * empty home need boards the preview's `basic` fixture is not.
 */

const OUT = 'screenshots/compare'
const VIEWPORT = { width: 1440, height: 900 }

type BoardName = 'basic' | 'empty-page' | 'empty' | 'find'

interface Surface {
  /** The reference this capture sits beside, as `<folder>/<name>` under `canon/design/`. */
  reference: string
  board: BoardName
  route: string
  /** Drives the state the reference shows once the route has loaded. */
  act?: (page: Page) => Promise<void>
  /** Opens the board through a ticket first, so the tab may write, as a move needs. */
  writer?: boolean
}

/** The center of a frame on screen. */
async function frameCenter(
  page: Page,
  ref: string,
): Promise<{ x: number; y: number }> {
  const box = await page.locator(`[data-frame="${ref}"]`).boundingBox()
  if (!box) throw new Error(`No ${ref} on screen`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A canvas point on screen, through the layer's transform. */
async function canvasPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  return page.locator('[data-layer]').evaluate(
    (layer: HTMLElement, point) => {
      const origin = layer.getBoundingClientRect()
      const k = Number(layer.style.getPropertyValue('--zoom') || 1)
      return { x: origin.left + point.x * k, y: origin.top + point.y * k }
    },
    { x, y },
  )
}

async function clickFrames(page: Page, refs: readonly string[]) {
  for (const [index, ref] of refs.entries()) {
    const at = await frameCenter(page, ref)
    if (index > 0) await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y)
    if (index > 0) await page.keyboard.up('Shift')
  }
}

const SURFACES: Surface[] = [
  { reference: 'toolbar/floating', board: 'basic', route: '/p/webapp/home' },
  {
    reference: 'shell/resize-none',
    board: 'basic',
    route: '/p/webapp/home',
    // The panel library finds its edge by distance rather than by the 1px element under the pointer.
    act: async (page) => {
      const edge = await page
        .getByRole('separator', { name: 'Resize the left panel' })
        .boundingBox()
      if (edge) await page.mouse.move(edge.x + edge.width / 2, edge.y + 400)
    },
  },
  {
    reference: 'shell/hide-ui',
    board: 'basic',
    route: '/p/webapp/home',
    act: (page) => page.getByRole('button', { name: 'Hide UI' }).click(),
  },
  {
    reference: 'canvas/play-panels',
    board: 'basic',
    route: '/p/webapp/home',
    act: (page) => page.getByRole('button', { name: 'Play' }).click(),
  },
  { reference: 'canvas/empty', board: 'empty-page', route: '/p/studio/page-1' },
  {
    reference: 'inspector/frame',
    board: 'basic',
    route: '/p/webapp/home',
    writer: true,
    act: async (page) => {
      await clickFrames(page, ['webapp/home/hero'])
      await expect(
        page.getByRole('textbox', { name: 'X position' }),
      ).toBeEnabled()
    },
  },
  {
    reference: 'inspector/multi',
    board: 'basic',
    route: '/p/webapp/home',
    writer: true,
    act: (page) => clickFrames(page, ['webapp/home/hero', 'webapp/home/about']),
  },
  {
    reference: 'canvas/marquee',
    board: 'basic',
    route: '/p/webapp/home',
    act: async (page) => {
      const from = await canvasPoint(page, -60, -80)
      const to = await canvasPoint(page, 1700, 400)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 4 })
    },
  },
  {
    reference: 'canvas/snap',
    board: 'basic',
    route: '/p/webapp/home',
    writer: true,
    // The hero's top lands 3 px below the about frame's and snaps up to it.
    act: async (page) => {
      await clickFrames(page, ['webapp/home/hero'])
      await expect(
        page.getByRole('textbox', { name: 'X position' }),
      ).toBeEnabled()
      const from = await canvasPoint(page, 700, 450)
      const to = await canvasPoint(page, 660, 453)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 4 })
    },
  },
  {
    reference: 'menus/avatar',
    board: 'basic',
    route: '/p/webapp/home',
    act: async (page) => {
      await page
        .getByRole('complementary', { name: 'Inspector' })
        .getByRole('button', { name: /from git user.name$|^Account$/ })
        .click()
      await page.getByRole('menu').waitFor()
    },
  },
  {
    reference: 'palette/commands',
    board: 'basic',
    route: '/p/webapp/home',
    act: async (page) => {
      await page.keyboard.press('ControlOrMeta+k')
      await page.getByRole('combobox').fill('ho')
      await page.getByRole('option').first().waitFor()
    },
  },
  {
    reference: 'layers/find',
    board: 'find',
    route: '/p/diligent-kite/playground',
    act: async (page) => {
      await page.keyboard.press('ControlOrMeta+f')
      await page
        .getByRole('combobox', { name: 'Find in diligent-kite' })
        .fill('started')
      await page.getByRole('option').first().waitFor()
    },
  },
  {
    reference: 'palette/shortcuts',
    board: 'basic',
    route: '/p/webapp/home',
    act: async (page) => {
      await page.keyboard.press('Shift+?')
      await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    },
  },
  {
    reference: 'tabs/assets',
    board: 'basic',
    route: '/p/webapp/home',
    writer: true,
    act: async (page) => {
      // The files on disk hold no pixels, so the thumbnails draw as the reference's gradients.
      await page.route('**/frames/*/assets/*', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect width="120" height="72" fill="#6d5bd0"/></svg>`,
        }),
      )
      await page.getByRole('tab', { name: 'Assets' }).click()
      await page.getByRole('button', { name: /Copy path of hero.png/ }).hover()
    },
  },
  { reference: 'home/grid', board: 'basic', route: '/' },
  {
    reference: 'home/list',
    board: 'basic',
    route: '/',
    act: (page) => page.getByRole('button', { name: 'List' }).click(),
  },
  { reference: 'home/empty', board: 'empty', route: '/' },
]

/** Days the `basic` copy's projects say they were made, so the list's Created column has dates to show. */
const CREATED: Record<string, string> = {
  marketing: '2026-09-02T09:00:00.000Z',
  webapp: '2026-10-14T09:00:00.000Z',
}

/** The files the Assets tab reference lists, by size, so each tile reads as drawn. */
const ASSET_SIZES: Record<string, number> = {
  'hero.png': 1_200_000,
  'loader.gif': 240_000,
  'logo.svg': 2_000,
  'Inter.woff2': 98_000,
  'demo.mp4': 4_100_000,
  'shared.css': 3_000,
}

/** The copy `layers/find` searches, across two pages as the reference draws them. */
const FIND_BOARD: Record<string, string> = {
  'diligent-kite/project.json':
    '{ "version": 1, "pages": ["playground", "onboarding"] }\n',
  'diligent-kite/playground/hello-world.html':
    '<!doctype html><body><h1>Hello, world</h1><p>Get started in minutes</p><button data-name="Get started"><span>Go</span></button></body>',
  'diligent-kite/playground/getting-started.html':
    '<!doctype html><body><h1>Pricing</h1></body>',
  'diligent-kite/onboarding/welcome.html':
    "<!doctype html><body><h1>Let's get you started</h1></body>",
  'diligent-kite/onboarding/step-1.html':
    '<!doctype html><body><p>Before you get started, pick a name</p></body>',
}

function makeBoard(name: BoardName): FixtureBoard | TempBoard {
  if (name === 'basic') {
    const board = copyFixtureBoard('basic')
    for (const [project, createdAt] of Object.entries(CREATED)) {
      const file = path.join(board.root, project, 'project.json')
      const record = JSON.parse(readFileSync(file, 'utf8')) as object
      writeFileSync(file, JSON.stringify({ ...record, createdAt }))
    }
    const assets = path.join(board.root, 'webapp', 'assets')
    mkdirSync(assets)
    for (const [file, size] of Object.entries(ASSET_SIZES)) {
      writeFileSync(path.join(assets, file), Buffer.alloc(size))
    }
    return board
  }
  if (name === 'empty') return writeBoard({})
  if (name === 'find') return writeBoard(FIND_BOARD)
  return writeBoard({
    'studio/project.json': '{ "version": 1, "pages": ["page-1"] }\n',
    'studio/page-1/layout.json': '{ "version": 1, "frames": {} }\n',
  })
}

const boards = new Map<
  BoardName,
  { board: FixtureBoard | TempBoard; server: BoardServer }
>()
for (const name of new Set(SURFACES.map((surface) => surface.board))) {
  const board = makeBoard(name)
  boards.set(name, { board, server: await serveBoard(board.root) })
  // `serve` starts an empty folder with one project, so the empty home is a
  // board whose last project was deleted while it ran.
  if (name === 'empty') {
    rmSync(path.join(board.root, 'untitled'), { recursive: true, force: true })
  }
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const surface of SURFACES) {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      if (theme === 'dark') {
        await page.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.classList.add('dark')
          })
        })
      }
      const { server } = boards.get(surface.board) ?? {}
      if (!server) throw new Error(`No server for the ${surface.board} board`)
      if (surface.writer) await page.goto(await server.ticketUrl())
      await page.goto(`${server.url}${surface.route}`)
      await page.waitForLoadState('networkidle')
      if (surface.board === 'empty') {
        await page.getByRole('heading', { name: 'No projects yet' }).waitFor()
      }
      await surface.act?.(page)
      await page.evaluate(() => document.fonts.ready)
      const file = path.join(
        OUT,
        `${surface.reference.replace('/', '-')}--${theme}.png`,
      )
      await page.screenshot({ path: file })
      console.log(`captured ${file}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
  for (const { board, server } of boards.values()) {
    await server.stop()
    board.cleanup()
  }
}
