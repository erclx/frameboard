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

    it('reports unwrapped text running past the width though its block fits', async () => {
      const findings = await checkHero(
        'h1 { white-space: nowrap }',
        '<h1>A heading far longer than the frame is wide</h1>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringMatching(
            /px wide in its 400 px width, so the board cuts it off, <h1> at element 5 first past the box\./,
          ),
        },
      ])
    })

    it('reports wrapped text spilling below a block shorter than it', async () => {
      const findings = await checkHero(
        'p { height: 20px; margin: 0 }',
        `<p>${'Many words that wrap onto line after line '.repeat(30)}</p>`,
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringMatching(
            /px tall in its 200 px height, so the board cuts it off, <p> at element 5 first past the box\./,
          ),
        },
      ])
    })

    it('reads a tight line height flush with the bottom edge as no finding', async () => {
      const findings = await checkHero(
        'body { margin: 0 } div { height: 152px } h1 { margin: 0; font-size: 48px; line-height: 1 }',
        '<div></div><h1>Heading</h1>',
      )

      expect(findings).toEqual([])
    })

    it('reads a tight line height heading wrapping its text in a link as no finding', async () => {
      const findings = await checkHero(
        'body { margin: 0 } div { height: 152px } h1 { margin: 0; font-size: 48px; line-height: 1 }',
        '<div></div><h1><a href="#">Heading</a></h1>',
      )

      expect(findings).toEqual([])
    })

    it('reports a padded inline badge painting past the bottom edge under a tight line height', async () => {
      const findings = await checkHero(
        'body { margin: 0 } div { height: 152px } h1 { margin: 0; font-size: 48px; line-height: 1 } span { padding: 12px 0; background: red }',
        '<div></div><h1><span>Heading</span></h1>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'clipped',
          message: expect.stringContaining('<span> at element 7 first past'),
        },
      ])
    })

    it('reads unwrapped text cropped by its own block as no finding', async () => {
      const findings = await checkHero(
        'p { width: 100px; overflow: hidden; white-space: nowrap }',
        '<p>A line far longer than the paragraph holds, and longer than the frame is wide</p>',
      )

      expect(findings).toEqual([])
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
