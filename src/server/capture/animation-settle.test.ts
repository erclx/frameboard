import type { Page } from 'playwright-core'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { settleAnimations } from './animation-settle'

// A transition the page starts a frame after load, as a scroll reveal does.
const REVEAL = `
<style>
  #box { opacity: 0; transition: opacity 300ms linear; }
  #box.in { opacity: 1; }
</style>
<div id="box">Hello</div>
<script>
  requestAnimationFrame(() => document.getElementById('box').classList.add('in'))
</script>`

// A second transition the first one's end starts.
const CHAINED = `
<style>
  #box { opacity: 0; transition: opacity 150ms linear; }
  #box.in { opacity: 0.5; }
  #box.in.done { opacity: 1; }
</style>
<div id="box">Hello</div>
<script>
  const box = document.getElementById('box')
  box.addEventListener('transitionend', () => box.classList.add('done'), { once: true })
  requestAnimationFrame(() => box.classList.add('in'))
</script>`

const INFINITE = `
<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  #box { animation: spin 1s linear infinite; }
</style>
<div id="box">Hello</div>`

const LONG = `
<style>
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  #box { animation: fade 5s linear; }
</style>
<div id="box">Hello</div>`

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'settleAnimations',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let page: Page

    beforeEach(async () => {
      page = await requireShell(shell).newPage()
    })

    afterEach(async () => {
      await page.close()
    })

    const opacity = () =>
      page.$eval('#box', (box) => getComputedStyle(box).opacity)

    it('ends a transition the page starts after load', async () => {
      await page.setContent(REVEAL)

      await settleAnimations(page, 5_000)

      expect(await opacity()).toBe('1')
    })

    it('ends a transition another one starts', async () => {
      await page.setContent(CHAINED)

      await settleAnimations(page, 5_000)

      expect(await opacity()).toBe('1')
    })

    it('returns at once beside an infinite animation', async () => {
      await page.setContent(INFINITE)
      const started = Date.now()

      await settleAnimations(page, 5_000)

      expect(Date.now() - started).toBeLessThan(1_000)
    })

    it('returns without refusing when the time runs out first', async () => {
      await page.setContent(LONG)
      const started = Date.now()

      await settleAnimations(page, 200)

      expect(Date.now() - started).toBeLessThan(2_000)
      expect(Number(await opacity())).toBeLessThan(1)
    })
  },
)
