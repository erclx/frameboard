import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Page } from 'playwright-core'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { settleAnimations } from './animation-settle'
import { type FrameHost, startFrameHost } from './host'
import { openFrame } from './render'

// A transition the page starts a frame after load, as a scroll reveal does.
// canon-allow-embedded: the page whose transition the settle assertion waits on, kept beside it
const REVEAL = `
<style>
  #box { opacity: 0; transition: opacity 300ms linear; }
  #box.in { opacity: 1; }
</style>
<div id="box">Hello</div>
<script>
  const box = document.getElementById('box')
  // A reveal starts from a styled element, so the start style is read first.
  getComputedStyle(box).opacity
  requestAnimationFrame(() => box.classList.add('in'))
</script>`

// A second transition the first one's end starts.
// canon-allow-embedded: the page whose chained transition the settle assertion waits on, kept beside it
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
  #box { animation: fade 60s linear; }
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

      await settleAnimations(page, 60_000)

      // Opacity cannot prove this one, so the bound does. It sits far under the
      // 60 s limit and the 15 s test timeout, with room for a machine stall of
      // a few seconds that a tighter bound would read as a slow settle.
      expect(Date.now() - started).toBeLessThan(10_000)
    })

    it('returns without refusing when the time runs out first', async () => {
      await page.setContent(LONG)
      const started = Date.now()

      await settleAnimations(page, 200)

      // Opacity on the 60 s animation proves the settle returned before its
      // end, so this bound only reports a settle that waited, with a figure,
      // ahead of the test timeout. It allows a machine stall of about 3 s.
      // Keep the opacity read, since without it a settle awaiting the end
      // passes until the 15 s test timeout.
      expect(Date.now() - started).toBeLessThan(10_000)
      expect(Number(await opacity())).toBeLessThan(1)
    })
  },
)

describe.skipIf(shell === null)(
  'openFrame under fonts require',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let host: FrameHost
    let board: TempBoard
    let faces: string

    beforeAll(async () => {
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      // Longer than an open takes, so only the settle brings it to rest.
      board = writeBoard({
        'studio/home/reveal.html': REVEAL.replace('300ms', '1500ms'),
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    it('resolves with a transition started after load at rest', async () => {
      const opened = await openFrame(requireShell(shell), {
        baseUrl: host.url,
        ref: 'studio/home/reveal',
        box: { width: 200, height: 100 },
        theme: 'light',
      })
      const opacity = await opened.page.$eval(
        '#box',
        (box) => getComputedStyle(box).opacity,
      )
      await opened.close()

      expect(opacity).toBe('1')
    })
  },
)
