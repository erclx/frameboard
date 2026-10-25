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

/** One frame at 400 by 200 whose body is `body`, styled by `css`. */
function heroBoard(css: string, body: string): Record<string, string> {
  return {
    'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title><style>${css}</style></head><body>${body}</body></html>`,
    'studio/home/layout.json': JSON.stringify({
      version: 1,
      frames: { hero: { x: 0, y: 0, width: 400, height: 200, order: 0 } },
    }),
  }
}

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'the layout rules',
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

    async function checkHero(css: string, body: string) {
      board = writeBoard(heroBoard(css, body))
      const served = await serveRendered(board.root)
      try {
        return await checkRendered(browser, {
          baseUrl: served.url,
          root: board.root,
          frame: served.target(REF),
          config: {},
        })
      } finally {
        await served.close()
      }
    }

    it('names the first element past the box and how many more', async () => {
      const findings = await checkHero(
        'div { height: 150px }',
        '<div>one</div><div>two</div><div>three</div>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringContaining(
            '<div> at element 6 first past the box and 1 more element is',
          ),
        },
      ])
    })

    it('reports content wider than the box as clipped', async () => {
      const findings = await checkHero(
        'div { width: 600px }',
        '<div>wide</div>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringMatching(
            /px wide .*Reflow or shorten the content to fit its 400 px width/,
          ),
        },
      ])
    })

    it('advises frame fit for content taller than the box alone', async () => {
      const findings = await checkHero(
        'div { height: 300px }',
        '<div>tall</div>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringMatching(
            /Run frame fit, or shorten the content\.$/,
          ),
        },
      ])
    })

    it('advises frame fit for the height and reflowing for the width when both overflow', async () => {
      const findings = await checkHero(
        'div { width: 600px; height: 300px }',
        '<div>both</div>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringMatching(
            /Run frame fit for the height, and reflow or shorten the content to fit its 400 px width\.$/,
          ),
        },
      ])
    })

    it('reads text cut by an ellipsis as no finding', async () => {
      const findings = await checkHero(
        'p { width: 100px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }',
        '<p>A line far longer than the paragraph holds</p>',
      )

      expect(findings).toEqual([])
    })

    it('reads an image cropped by overflow hidden as no finding', async () => {
      const findings = await checkHero(
        '.crop { width: 100px; height: 100px; overflow: hidden } .crop div { width: 300px; height: 300px }',
        '<div class="crop"><div></div></div>',
      )

      expect(findings).toEqual([])
    })

    it('reads a 100vh element cropped by overflow hidden as no finding', async () => {
      const findings = await checkHero(
        '.crop { height: 100px; overflow: hidden } .crop div { height: 100vh }',
        '<div class="crop"><div></div></div>',
      )

      expect(findings).toEqual([])
    })

    it('names the panel that scrolls by its element index', async () => {
      const findings = await checkHero(
        '.panel { height: 50px; overflow: auto } .panel div { height: 80px }',
        '<div class="panel"><div>long</div></div>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'scrollbar',
          message: expect.stringContaining('<div> at element 5'),
        },
      ])
    })

    it('names the theme when only one theme trips a rule', async () => {
      const findings = await checkHero(
        '[data-theme="dark"] div { height: 400px }',
        '<div>tall in dark</div>',
      )

      expect(findings).toMatchObject([
        { rule: 'clipped', message: expect.stringMatching(/^In dark, /) },
      ])
    })
  },
)
