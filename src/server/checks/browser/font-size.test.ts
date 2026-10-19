import type { Browser } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
} from '../../../../test/support/headless-shell'
import { serveRendered } from '../../../../test/support/rendered-board'
import { type TempBoard, writeBoard } from '../../../../test/support/temp-board'
import { checkRendered } from './rendered'

const REF = 'studio/home/hero'

const shell = await launchShellOrNull()

describe.skipIf(shell === null)('the min-font-size rule', () => {
  let browser: Browser
  let board: TempBoard

  beforeAll(() => {
    browser = requireShell(shell)
  })

  afterEach(() => {
    board.cleanup()
  })

  afterAll(async () => {
    await browser.close()
  })

  async function checkHero(body: string, minFontSize: number) {
    board = writeBoard({
      'studio/home/hero.html': `<!doctype html><html lang="en"><head><title>hero</title></head><body>${body}</body></html>`,
    })
    const served = await serveRendered(board.root)
    try {
      return await checkRendered(browser, {
        baseUrl: served.url,
        frame: served.target(REF),
        config: { minFontSize },
      })
    } finally {
      await served.close()
    }
  }

  it('names the smallest text and how many more fall under', async () => {
    const findings = await checkHero(
      '<p style="font-size: 11px">a</p><p style="font-size: 9px">b</p><p style="font-size: 10px">c</p>',
      12,
    )

    expect(findings).toMatchObject([
      {
        rule: 'min-font-size',
        severity: 'error',
        message:
          "studio/home/hero sets text at 9 px in <p> at element 5, under the project's 12 px minimum, and 2 more elements are under it.",
      },
    ])
  })

  it('passes text exactly at the minimum', async () => {
    expect(await checkHero('<p style="font-size: 12px">a</p>', 12)).toEqual([])
  })

  it('skips an element carrying no text of its own', async () => {
    const findings = await checkHero(
      '<div style="font-size: 4px"><p style="font-size: 14px">a</p></div>',
      12,
    )

    expect(findings).toEqual([])
  })
})
