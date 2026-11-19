import { fileURLToPath } from 'node:url'

import type { Browser } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { ProjectChecks } from '@/shared/records/board'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../../test/support/headless-shell'
import {
  type RenderedBoard,
  serveRendered,
} from '../../../../test/support/rendered-board'
import { type TempBoard, writeBoard } from '../../../../test/support/temp-board'
import { checkRendered } from './rendered'

// The checks only read, so the committed fixture serves every test as is.
const ROOT = fileURLToPath(
  new URL('../../../../test/fixtures/boards/checks/', import.meta.url),
).replace(/\/$/, '')

const CONFIG: ProjectChecks = { minFontSize: 12, minContrast: 4.5 }

/** One 400 by 200 frame whose `main` slides in from 48 px right over 30 s, styled by `css`. */
function entranceBoard(css: string): Record<string, string> {
  return {
    'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title><style>
      body { margin: 0 }
      main { animation: slide 30s ease-out }
      @keyframes slide { from { transform: translateX(48px) } to { transform: none } }
      ${css}
    </style></head><body><main>Slides in</main></body></html>`,
    'studio/home/layout.json': JSON.stringify({
      version: 1,
      frames: { hero: { x: 0, y: 0, width: 400, height: 200, order: 0 } },
    }),
  }
}

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'checkRendered',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let board: RenderedBoard

    beforeAll(async () => {
      browser = requireShell(shell)
      board = await serveRendered(ROOT)
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await board.close()
      await browser.close()
    }, SHELL_HOOK_TIMEOUT_MS)

    function check(ref: string, config = CONFIG) {
      return checkRendered(browser, {
        baseUrl: board.url,
        root: ROOT,
        frame: board.target(ref),
        config,
      })
    }

    it.each([
      ['rules/clipped/fail', 'clipped', 'error'],
      ['rules/scrollbar/fail', 'scrollbar', 'warning'],
      ['rules/viewport/fail', 'viewport', 'warning'],
      ['rules/min-font-size/fail', 'min-font-size', 'warning'],
      ['rules/min-contrast/fail', 'min-contrast', 'warning'],
    ])('reports %s for %s alone, at %s', async (ref, rule, severity) => {
      const findings = await check(ref)

      expect(findings).toMatchObject([
        { rule, severity, frame: ref, path: `${ref}.html`, location: null },
      ])
    })

    it.each([
      'rules/clipped/pass',
      'rules/scrollbar/pass',
      'rules/viewport/pass',
      'rules/min-font-size/pass',
      'rules/min-contrast/pass',
    ])('passes %s', async (ref) => {
      expect(await check(ref)).toEqual([])
    })

    it('names no theme when both themes trip a rule', async () => {
      const [found] = await check('rules/clipped/fail')

      expect(found?.message).toMatch(/^rules\/clipped\/fail is/)
    })

    it('leaves the minimum font size off without the config', async () => {
      expect(await check('rules/min-font-size/fail', {})).toEqual([])
    })

    it('leaves the minimum contrast off without the config', async () => {
      expect(await check('rules/min-contrast/fail', {})).toEqual([])
    })

    it('lands no finding for a browser rule the project turned off', async () => {
      expect(
        await check('rules/clipped/fail', { ...CONFIG, off: ['clipped'] }),
      ).toEqual([])
    })

    it('names the theme when one theme alone trips a rule', async () => {
      // Literal text color reads on the light canvas and sinks into the dark one.
      const findings = await check('rules/theme/fail')

      expect(findings).toMatchObject([
        { rule: 'min-contrast', message: expect.stringMatching(/^In dark, /) },
      ])
    })

    describe('on a phone frame showing its device', () => {
      let temp: TempBoard

      afterEach(() => {
        temp.cleanup()
      })

      /** A 390 by 844 frame holding a block 820 tall, inside its box but past the page under the status bar. */
      async function checkPhone(device?: 'phone') {
        temp = writeBoard({
          'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title><style>body { margin: 0 } main { height: 820px }</style></head><body><main>Tall</main></body></html>`,
          'studio/home/layout.json': JSON.stringify({
            version: 1,
            frames: { hero: { x: 0, y: 0, width: 390, height: 844, order: 0 } },
          }),
        })
        const served = await serveRendered(temp.root)
        try {
          return await checkRendered(browser, {
            baseUrl: served.url,
            root: temp.root,
            frame: { ...served.target('studio/home/hero'), device },
            config: {},
          })
        } finally {
          await served.close()
        }
      }

      it('reads the page under the status bar, so content past it is clipped', async () => {
        const findings = await checkPhone('phone')

        expect(findings).toMatchObject([
          { rule: 'clipped', message: expect.stringContaining('790 px') },
        ])
      })

      it('reads the whole box with no device', async () => {
        expect(await checkPhone()).toEqual([])
      })
    })

    describe('on a frame with an entrance animation', () => {
      let temp: TempBoard

      afterEach(() => {
        temp.cleanup()
      })

      async function checkEntrance(css: string) {
        temp = writeBoard(entranceBoard(css))
        const served = await serveRendered(temp.root)
        try {
          return await checkRendered(browser, {
            baseUrl: served.url,
            root: temp.root,
            frame: served.target('studio/home/hero'),
            config: {},
          })
        } finally {
          await served.close()
        }
      }

      it('lands no clipped for an entrance that settles inside the frame', async () => {
        expect(await checkEntrance('')).toEqual([])
      })

      it('lands no clipped for a delayed entrance its fill holds off the edge', async () => {
        expect(
          await checkEntrance(
            'main { animation-delay: 20s; animation-fill-mode: both }',
          ),
        ).toEqual([])
      })

      it('still reports clipped for content past the edge at rest', async () => {
        const findings = await checkEntrance('main { width: 520px }')

        expect(findings).toMatchObject([{ rule: 'clipped', severity: 'error' }])
      })

      it('leaves a repeating animation running and reads the frame', async () => {
        expect(
          await checkEntrance('main { animation-iteration-count: infinite }'),
        ).toMatchObject([{ rule: 'clipped' }])
      })
    })

    it('holds text to the minimum the project sets', async () => {
      // The fail frame's lede sits at 3.40:1 in light and 3.35:1 in dark.
      expect(
        await check('rules/min-contrast/fail', { minContrast: 3 }),
      ).toEqual([])
    })
  },
)
