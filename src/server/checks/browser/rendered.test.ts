import { fileURLToPath } from 'node:url'

import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
import { checkRendered } from './rendered'

// The checks only read, so the committed fixture serves every test as is.
const ROOT = fileURLToPath(
  new URL('../../../../test/fixtures/boards/checks/', import.meta.url),
).replace(/\/$/, '')

const CONFIG: ProjectChecks = { minFontSize: 12, minContrast: 4.5 }

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

    it('names the theme when one theme alone trips a rule', async () => {
      // Literal text color reads on the light canvas and sinks into the dark one.
      const findings = await check('rules/theme/fail')

      expect(findings).toMatchObject([
        { rule: 'min-contrast', message: expect.stringMatching(/^In dark, /) },
      ])
    })

    it('holds text to the minimum the project sets', async () => {
      // The fail frame's lede sits at 3.40:1 in light and 3.35:1 in dark.
      expect(
        await check('rules/min-contrast/fail', { minContrast: 3 }),
      ).toEqual([])
    })
  },
)
