import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium, type Page } from '@playwright/test'

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

type BoardName = 'basic' | 'empty-page' | 'empty'

interface Surface {
  /** The reference this capture sits beside, as `<folder>/<name>` under `canon/design/`. */
  reference: string
  board: BoardName
  route: string
  /** Drives the state the reference shows once the route has loaded. */
  act?: (page: Page) => Promise<void>
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

function makeBoard(name: BoardName): FixtureBoard | TempBoard {
  if (name === 'basic') {
    const board = copyFixtureBoard('basic')
    for (const [project, createdAt] of Object.entries(CREATED)) {
      const file = path.join(board.root, project, 'project.json')
      const record = JSON.parse(readFileSync(file, 'utf8')) as object
      writeFileSync(file, JSON.stringify({ ...record, createdAt }))
    }
    return board
  }
  if (name === 'empty') return writeBoard({})
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
