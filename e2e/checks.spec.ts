import { existsSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { scanBoard } from '@/server/board/scan'
import { buildCascade } from '@/server/checks/cascade'
import { textElements } from '@/server/checks/fonts'
import { checkFrame } from '@/server/checks/frame'
import { readFrame } from '@/server/checks/frame-source'
import { readThemeColors } from '@/server/checks/theme'
import { tokenSheets } from '@/server/checks/tokens'
import { frameUrl } from '@/shared/board-urls'
import { checkResultSchema } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

import { cli } from '../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

/**
 * Holds the font and theme rules to the browser's own answer: the first
 * family Chromium computes for every text element, and whether a frame's
 * colors change between the light and dark theme. The hand board runs
 * everywhere. A local corpus, which stays private, runs only where
 * FRAMEBOARD_CORPUS names its board folder.
 */

/** Stands for the browser's default font and the control font, which no sheet names. */
const DEFAULT = '(default)'

interface Rendered {
  /** Each text element's first family, the browser's own fonts read as `DEFAULT`. */
  families: string[]
  colors: string
}

/**
 * What Chromium renders, with every text element read the way `textElements`
 * picks them. The browser's default and control fonts are probed inside the
 * frame itself, since the default family follows the document's `lang` and a
 * blank page probes another one on Linux.
 */
async function rendered(
  page: Page,
  theme: 'light' | 'dark',
): Promise<Rendered> {
  await page.emulateMedia({ colorScheme: theme })
  return page.evaluate((theme) => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    const skipped = new Set([
      'HTML',
      'HEAD',
      'TITLE',
      'SCRIPT',
      'STYLE',
      'NOSCRIPT',
      'TEMPLATE',
    ])
    const first = (family: string) =>
      (family.split(',')[0] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
    const probe = (tag: string, style: string) => {
      const element = document.createElement(tag)
      element.setAttribute('style', style)
      root.append(element)
      const family = first(getComputedStyle(element).fontFamily)
      element.remove()
      return family
    }
    const browserFonts = new Set([
      probe('span', 'font-family: initial'),
      probe('button', 'all: revert'),
    ])
    const families = [...document.querySelectorAll('*')]
      .filter(
        (element) =>
          !skipped.has(element.tagName) &&
          !element.closest('head') &&
          [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              (node.nodeValue ?? '').trim() !== '',
          ),
      )
      .map((element) => first(getComputedStyle(element).fontFamily))
      .map((family) => (browserFonts.has(family) ? '(default)' : family))
    const colors = [...document.querySelectorAll('body, body *')]
      .map((element) => {
        const style = getComputedStyle(element)
        return `${style.color}|${style.backgroundColor}|${style.borderTopColor}`
      })
      .join('\n')
    return { families, colors }
  }, theme)
}

/** The static answer for the same elements, in the same order. */
function staticFamilies(root: string, frame: FrameRecord): string[] {
  const source = readFrame({
    root,
    project: frame.project,
    page: frame.page,
    name: frame.name,
  })
  const cascade = buildCascade(source, tokenSheets(root, frame.project))
  return textElements(source).map(
    (element) => cascade.firstFamily(element) ?? DEFAULT,
  )
}

async function framesOf(root: string): Promise<FrameRecord[]> {
  const board = await scanBoard(root)
  return board.projects.flatMap((project) =>
    project.pages.flatMap((page) => page.frames),
  )
}

test.describe('the static font and theme rules against the browser', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeAll(async () => {
    board = copyFixtureBoard('cascade')
    server = await serveBoard(board.root)
  })

  test.afterAll(async () => {
    await server.stop()
    board.cleanup()
  })

  test('agrees on the first family of every text element', async ({ page }) => {
    const frames = await framesOf(board.root)
    expect(frames.length).toBeGreaterThan(0)

    for (const frame of frames) {
      await page.goto(`${server.url}${frameUrl(frame.ref)}`)
      const { families } = await rendered(page, 'light')

      expect(families, frame.ref).toEqual(staticFamilies(board.root, frame))
    }
  })

  test('flags one theme exactly where the colors stay put', async ({
    page,
  }) => {
    for (const frame of await framesOf(board.root)) {
      await page.goto(`${server.url}${frameUrl(frame.ref)}`)
      const light = await rendered(page, 'light')
      const dark = await rendered(page, 'dark')
      const flagged = checkFrame({
        root: board.root,
        project: frame.project,
        page: frame.page,
        name: frame.name,
      }).findings.some((finding) => finding.rule === 'theme')

      expect(flagged, frame.ref).toBe(
        frame.page === 'themes' && light.colors === dark.colors,
      )
    }
  })
})

/** Each browser rule's fixture page, the rule its fail frame breaks alone. */
const BROWSER_PAGES = ['clipped', 'scrollbar', 'viewport', 'min-font-size']

test.describe('the browser rules on a running board', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeAll(async () => {
    board = copyFixtureBoard('checks')
    server = await serveBoard(board.root)
    // check answers once the server's startup sweep has landed every frame,
    // so no label count changes under an assertion.
    await cli(['check', '--json'], { cwd: board.root })
  })

  test.afterAll(async () => {
    await server.stop()
    board.cleanup()
  })

  for (const rule of BROWSER_PAGES) {
    test(`marks the ${rule} fail frame alone`, async ({ page }) => {
      await page.goto(`${server.url}/p/rules/${rule}`)
      const fail = page.locator(`[data-frame="rules/${rule}/fail"]`)
      const pass = page.locator(`[data-frame="rules/${rule}/pass"]`)
      await expect(fail).toBeVisible()
      await expect(pass).toBeVisible()

      await expect(
        fail.getByRole('button', { name: '1 check finding' }),
      ).toBeVisible()
      await expect(pass.getByRole('img')).toHaveCount(0)
    })
  }

  test('returns the same rule ids from check while the server runs', async () => {
    const run = await cli(['check', '--json'], { cwd: board.root })
    const result = checkResultSchema.parse(run.json().error?.details)
    const browserRules = new Set(BROWSER_PAGES)

    expect(result.browser).toEqual({ ran: true })
    expect(
      result.findings
        .filter((finding) => browserRules.has(finding.rule))
        .map((finding) => `${finding.frame} ${finding.rule}`)
        .sort(),
    ).toEqual(BROWSER_PAGES.map((rule) => `rules/${rule}/fail ${rule}`).sort())
  })
})

const corpus = process.env.FRAMEBOARD_CORPUS

test.describe('the static rules against the browser on the local corpus', () => {
  test.skip(
    !corpus || !existsSync(corpus),
    'FRAMEBOARD_CORPUS names no local board folder',
  )
  test.setTimeout(10 * 60_000)

  let server: BoardServer

  test.beforeAll(async () => {
    server = await serveBoard(corpus ?? '')
  })

  test.afterAll(async () => {
    await server.stop()
  })

  test('raises no font or theme finding the browser does not render', async ({
    page,
  }) => {
    const root = corpus ?? ''
    const disagreements: string[] = []
    const frames = await framesOf(root)
    expect(frames.length).toBeGreaterThan(0)

    for (const frame of frames) {
      await page.goto(`${server.url}${frameUrl(frame.ref)}`)
      const light = await rendered(page, 'light')
      const dark = await rendered(page, 'dark')
      const families = light.families
      const rules = new Set(
        checkFrame({
          root,
          project: frame.project,
          page: frame.page,
          name: frame.name,
        }).findings.map((finding) => finding.rule),
      )
      const { firstColor } = readThemeColors(
        readFrame({
          root,
          project: frame.project,
          page: frame.page,
          name: frame.name,
        }),
      )
      const verdicts = {
        'default-font': families.includes(DEFAULT),
        'generic-font': families.some((family) =>
          /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|math|emoji|fangsong)$/i.test(
            family,
          ),
        ),
        theme: firstColor !== null && light.colors === dark.colors,
      }
      for (const [rule, renders] of Object.entries(verdicts)) {
        if (rules.has(rule) !== renders) {
          disagreements.push(
            `${frame.ref}: static ${rules.has(rule)}, browser ${renders} for ${rule}`,
          )
        }
      }
    }

    expect(disagreements).toEqual([])
  })
})
