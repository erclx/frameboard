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

const HUGGING = { hugHeight: true }

const STICKY = '<header style="position: sticky; top: 0">Pinned</header>'

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'the scroll-effect rule',
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

    /** The scroll-effect findings on a 400 by 200 frame whose body is `body`, its entry taking `entry`. */
    async function checkHero(body: string, entry: object) {
      board = writeBoard({
        'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title></head><body>${body}</body></html>`,
        'studio/home/layout.json': JSON.stringify({
          version: 1,
          frames: {
            hero: { x: 0, y: 0, width: 400, height: 200, order: 0, ...entry },
          },
        }),
      })
      const served = await serveRendered(board.root)
      try {
        const findings = await checkRendered(browser, {
          baseUrl: served.url,
          root: board.root,
          frame: served.target(REF),
          config: {},
        })
        return findings.filter((found) => found.rule === 'scroll-effect')
      } finally {
        await served.close()
      }
    }

    it('warns on a hugging frame holding position: sticky, naming the element', async () => {
      const findings = await checkHero(STICKY, HUGGING)

      expect(findings).toMatchObject([
        {
          severity: 'warning',
          message: expect.stringMatching(
            /position: sticky on <header> at element 4.*frame resize --scroll/,
          ),
        },
      ])
    })

    it.each(['window', 'document'])(
      'warns on a scroll listener on the %s',
      async (target) => {
        const findings = await checkHero(
          `<script>${target}.addEventListener('scroll', () => {})</script>`,
          HUGGING,
        )

        expect(findings).toMatchObject([
          {
            message: expect.stringContaining(
              `listens for scroll on the ${target}`,
            ),
          },
        ])
      },
    )

    it('warns on an animation on a scroll timeline', async () => {
      const findings = await checkHero(
        '<style>@keyframes grow { to { width: 100% } } .bar { animation: grow linear; animation-timeline: scroll() }</style><div class="bar">Progress</div>',
        HUGGING,
      )

      expect(findings).toMatchObject([
        { message: expect.stringContaining('scroll or view timeline') },
      ])
    })

    it('draws none on a scroll frame', async () => {
      const findings = await checkHero(STICKY, { ...HUGGING, scroll: true })

      expect(findings).toEqual([])
    })

    it('draws none on a frame holding a fixed height', async () => {
      const findings = await checkHero(STICKY, {})

      expect(findings).toEqual([])
    })

    it('draws none on a sticky element inside its own scroll box', async () => {
      const findings = await checkHero(
        `<div style="overflow: auto; height: 100px">${STICKY}<p>Rows</p></div>`,
        HUGGING,
      )

      expect(findings).toEqual([])
    })

    it('draws none on a listener on an inner element', async () => {
      const findings = await checkHero(
        `<div id="list"></div><script>document.getElementById('list').addEventListener('scroll', () => {})</script>`,
        HUGGING,
      )

      expect(findings).toEqual([])
    })
  },
)
