import type { Browser } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../../test/support/headless-shell'
import { serveRendered } from '../../../../test/support/rendered-board'
import { type TempBoard, writeBoard } from '../../../../test/support/temp-board'
import { checkRendered } from './rendered'

const REF = 'studio/home/hero'

/** One frame at 400 by 200 whose head holds `head` and body `body`. */
function heroBoard(
  head: string,
  body: string,
  files: Record<string, string> = {},
): Record<string, string> {
  return {
    'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title>${head}</head><body>${body}</body></html>`,
    'studio/home/layout.json': JSON.stringify({
      version: 1,
      frames: { hero: { x: 0, y: 0, width: 400, height: 200, order: 0 } },
    }),
    ...files,
  }
}

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'the dropped-declaration rule',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let board: TempBoard

    beforeAll(() => {
      browser = requireShell(shell)
    }, SHELL_HOOK_TIMEOUT_MS)

    afterEach(() => {
      board.cleanup()
    })

    afterAll(async () => {
      await browser.close()
    }, SHELL_HOOK_TIMEOUT_MS)

    async function dropped(
      head: string,
      body = '<p>x</p>',
      files: Record<string, string> = {},
    ) {
      board = writeBoard(heroBoard(head, body, files))
      const served = await serveRendered(board.root)
      try {
        const findings = await checkRendered(browser, {
          baseUrl: served.url,
          root: board.root,
          frame: served.target(REF),
          config: {},
        })
        return findings.filter((each) => each.rule === 'dropped-declaration')
      } finally {
        await served.close()
      }
    }

    it('reports a misspelled property, a bad unit, and a bad keyword, each where it sits', async () => {
      const findings = await dropped(
        '<style>\n.a { colr: red; padding: 12pz; display: flexx }\n</style>',
      )

      expect(findings).toMatchObject([
        {
          path: 'studio/home/hero.html',
          location: { line: 2, column: 6 },
          message: expect.stringContaining('colr: red'),
        },
        { location: { line: 2, column: 17 } },
        { location: { line: 2, column: 32 } },
      ])
    })

    it('reports an unclosed rule and still checks the rules ahead of it', async () => {
      const findings = await dropped(
        '<style>\n.a { colr: red }\n.c { margin: 0 auto\n</style>',
      )

      expect(findings).toMatchObject([
        {
          location: { line: 3, column: 1 },
          message: expect.stringContaining('Unclosed block'),
        },
        { message: expect.stringContaining('colr: red') },
      ])
    })

    it('reports one in a style attribute at the attribute', async () => {
      expect(
        await dropped('', '<p style="color: red; margin: 4pz">x</p>'),
      ).toMatchObject([{ message: expect.stringContaining('margin: 4pz') }])
    })

    it('reports one in a linked sheet against that sheet', async () => {
      expect(
        await dropped('<link rel="stylesheet" href="hero.css">', '<p>x</p>', {
          'studio/home/hero.css': 'p {\n  colour: red;\n}\n',
        }),
      ).toMatchObject([
        { path: 'studio/home/hero.css', location: { line: 2, column: 3 } },
      ])
    })

    it('passes shorthands, !important, and values holding var()', async () => {
      expect(
        await dropped(
          '<style>.a { --gap: 4px; margin: 0 auto !important; border: 1px solid var(--line); font: 600 14px/1.4 Geist, sans-serif; padding: var(--gap) }</style>',
        ),
      ).toEqual([])
    })

    it('passes descriptors, guarded blocks, and prefixes for other engines', async () => {
      expect(
        await dropped(
          '<style>@font-face { font-family: X; src: url(x.woff2); font-display: swap } @supports (zoom: 1) { .a { future-thing: on } } .b { -moz-appearance: none; -webkit-font-smoothing: antialiased }</style>',
        ),
      ).toEqual([])
    })
  },
)
