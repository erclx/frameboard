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

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'the min-contrast rule',
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

    /** Checks a hero frame on `ground`, the body's own background. */
    async function checkHero(
      body: string,
      { ground = '#fdfdfc', minContrast = 4.5 } = {},
    ) {
      board = writeBoard({
        'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title><style>html { color-scheme: light; } body { margin: 0; background: ${ground}; font-size: 16px; }</style></head><body>${body}</body></html>`,
      })
      const served = await serveRendered(board.root)
      try {
        return await checkRendered(browser, {
          baseUrl: served.url,
          root: board.root,
          frame: served.target(REF),
          config: { minContrast },
        })
      } finally {
        await served.close()
      }
    }

    it('names the colors, the ratio, and the minimum for a lede under it', async () => {
      const findings = await checkHero(
        '<h1 style="color: #111">Title</h1><p style="color: #8a8a86">A lede</p>',
      )

      expect(findings).toMatchObject([
        {
          rule: 'min-contrast',
          severity: 'warning',
          message:
            "studio/home/hero sets text in <p> at element 6 at 3.40:1, #8a8a86 on #fdfdfc, under the project's 4.5:1 minimum.",
        },
      ])
    })

    it('names the element furthest under and counts the rest', async () => {
      const findings = await checkHero(
        '<p style="color: #8a8a86">a</p><p style="color: #c8c8c8">b</p><p style="color: #999">c</p>',
      )

      expect(findings).toMatchObject([
        {
          message: expect.stringMatching(
            /in <p> at element 6 at .*#c8c8c8 on #fdfdfc.*, and 2 more elements are under it\.$/,
          ),
        },
      ])
    })

    it('passes text at the minimum', async () => {
      // #767676 on white is 4.54:1, the darkest gray WCAG's 4.5 passes.
      expect(
        await checkHero('<p style="color: #767676">a</p>', { ground: '#fff' }),
      ).toEqual([])
    })

    it('floors a ratio just under the minimum rather than rounding it up', async () => {
      // #777777 on white is 4.48:1.
      const [found] = await checkHero('<p style="color: #777">a</p>', {
        ground: '#fff',
      })

      expect(found?.message).toContain('at 4.47:1')
    })

    it.each([
      ['24 px text', 'font-size: 24px'],
      ['18.67 px bold text', 'font-size: 18.67px; font-weight: 700'],
    ])('holds %s to the large text minimum', async (_, size) => {
      // #949494 on white is 3.03:1, over 3:1 and under 4.5:1.
      expect(
        await checkHero(`<p style="color: #949494; ${size}">a</p>`, {
          ground: '#fff',
        }),
      ).toEqual([])
    })

    it('holds 18 px text to the full minimum', async () => {
      const findings = await checkHero(
        '<p style="color: #949494; font-size: 18px">a</p>',
        { ground: '#fff' },
      )

      expect(findings).toMatchObject([{ rule: 'min-contrast' }])
    })

    it('names the large text minimum when large text falls under it', async () => {
      const [found] = await checkHero(
        '<p style="color: #bbb; font-size: 32px">a</p>',
        { ground: '#fff' },
      )

      expect(found?.message).toContain(
        "under the project's 3:1 minimum for large text",
      )
    })

    it('reads the project minimum it is given', async () => {
      // #595959 on white is 7.0:1, and #6b6b6b is 5.3:1.
      const findings = await checkHero('<p style="color: #6b6b6b">a</p>', {
        ground: '#fff',
        minContrast: 7,
      })

      expect(findings).toMatchObject([{ rule: 'min-contrast' }])
    })

    it.each([
      [
        'a gradient',
        '<div style="background: linear-gradient(#fff, #eee)"><p style="color: #ccc">a</p></div>',
      ],
      [
        'an image sibling under the text',
        '<div style="position: relative"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="position: absolute; inset: 0; width: 100%; height: 100%"><p style="position: relative; color: #ccc">a</p></div>',
      ],
      [
        'text clipped to its background',
        '<p style="color: #ccc; background: #fdfdfc; background-clip: text">a</p>',
      ],
      [
        'a running animation',
        '<style>@keyframes fade { from { opacity: 0 } to { opacity: 1 } }</style><p style="color: #ccc; animation: fade 60s infinite">a</p>',
      ],
    ])('skips text over %s', async (_, body) => {
      expect(await checkHero(body)).toEqual([])
    })

    it('composites a half-alpha background before measuring', async () => {
      // rgb(0 0 0 / 0.5) over white is #808080, which #8a8a8a sits on at 1.1:1.
      const [found] = await checkHero(
        '<div style="background: rgb(0 0 0 / 0.5)"><p style="color: #8a8a8a">a</p></div>',
        { ground: '#fff' },
      )

      expect(found?.message).toContain('#8a8a8a on #808080')
    })

    it('composites text opacity before measuring', async () => {
      // Black at 0.6 over white paints #666666, 5.74:1, and at 0.4 #999999, 2.85:1.
      const findings = await checkHero(
        '<p style="color: #000; opacity: 0.6">a</p><p style="color: #000; opacity: 0.4">b</p>',
        { ground: '#fff' },
      )

      expect(findings).toMatchObject([
        { message: expect.stringContaining('at element 6 at 2.84:1, #999999') },
      ])
    })

    it('reads an oklch color as sRGB', async () => {
      const [found] = await checkHero(
        '<p style="color: oklch(0.8 0 0)">a</p>',
        { ground: '#fff' },
      )

      // oklch(0.8 0 0) is #bebebe, 1.86:1 on white.
      expect(found?.message).toMatch(
        /at 1\.8\d:1, #b[d-f]b[d-f]b[d-f] on #ffffff/,
      )
    })

    it('measures the -webkit-text-fill-color over the color', async () => {
      expect(
        await checkHero(
          '<p style="color: #111; -webkit-text-fill-color: #ccc">a</p>',
        ),
      ).toMatchObject([{ rule: 'min-contrast' }])
    })

    it('skips text 1 px wide or less', async () => {
      expect(
        await checkHero(
          '<p style="color: #ccc; position: absolute; width: 1px; height: 1px; overflow: hidden; white-space: nowrap; font-size: 1px">a</p>',
        ),
      ).toEqual([])
    })
  },
)
