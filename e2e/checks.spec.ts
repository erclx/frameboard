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
import type { FrameRecord } from '@/shared/records/list'

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
  families: string[]
  colors: string
}

/** What Chromium renders, with every text element read the way `textElements` picks them. */
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
    const colors = [...document.querySelectorAll('body, body *')]
      .map((element) => {
        const style = getComputedStyle(element)
        return `${style.color}|${style.backgroundColor}|${style.borderTopColor}`
      })
      .join('\n')
    return { families, colors }
  }, theme)
}

/** The family Chromium gives a paragraph and a button no rule reaches. */
async function browserDefaults(page: Page): Promise<Set<string>> {
  await page.setContent('<p>x</p><button>x</button>')
  return new Set(
    await page.evaluate(() =>
      ['p', 'button'].map((tag) =>
        (
          getComputedStyle(
            document.querySelector(tag) as Element,
          ).fontFamily.split(',')[0] ?? ''
        ).trim(),
      ),
    ),
  )
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
    const defaults = await browserDefaults(page)
    const frames = await framesOf(board.root)
    expect(frames.length).toBeGreaterThan(0)

    for (const frame of frames) {
      await page.goto(`${server.url}${frameUrl(frame.ref)}`)
      const { families } = await rendered(page, 'light')

      expect(
        families.map((family) => (defaults.has(family) ? DEFAULT : family)),
        frame.ref,
      ).toEqual(staticFamilies(board.root, frame))
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
    const defaults = await browserDefaults(page)
    const disagreements: string[] = []
    const frames = await framesOf(root)
    expect(frames.length).toBeGreaterThan(0)

    for (const frame of frames) {
      await page.goto(`${server.url}${frameUrl(frame.ref)}`)
      const light = await rendered(page, 'light')
      const dark = await rendered(page, 'dark')
      const families = light.families.map((family) =>
        defaults.has(family) ? DEFAULT : family,
      )
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
