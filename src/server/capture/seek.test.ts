import type { Page } from 'playwright-core'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { filmstripMoments, findMotion, seekMotion } from './seek'

// A box sliding 200 px right over 2 s, so its left edge names the moment.
// canon-allow-embedded: the page whose slide the seek assertions hold, kept beside them
const SLIDE = `
<style>
  @keyframes slide { from { transform: translateX(0); } to { transform: translateX(200px); } }
  body { margin: 0; }
  #box { width: 10px; height: 10px; animation: slide 2s linear forwards; }
</style>
<div id="box"></div>`

const SPIN = `
<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  #box { width: 10px; height: 10px; animation: spin 1s linear infinite; }
</style>
<div id="box"></div>`

// A transition the page starts a frame after load, as a scroll reveal does.
// canon-allow-embedded: the page whose late transition the seek assertion holds, kept beside it
const REVEAL = `
<style>
  body { margin: 0; }
  #box { width: 10px; height: 10px; transform: translateX(0); transition: transform 1s linear; }
  #box.in { transform: translateX(100px); }
</style>
<div id="box"></div>
<script>
  const box = document.getElementById('box')
  getComputedStyle(box).transform
  requestAnimationFrame(() => box.classList.add('in'))
</script>`

// A HyperFrames-shaped runtime of 3 s that records the time it was seeked to.
// canon-allow-embedded: the window.__hf contract the seek assertion drives, kept beside it
const HF = `
<div id="box"></div>
<script>
  window.__hf = {
    duration: 3,
    seek(time) { document.getElementById('box').dataset.time = String(time) },
  }
  document.getElementById('box').dataset.time = 'unset'
</script>`

// Two paused GSAP-shaped timelines, the longer one 4 s, each recording its seek.
// canon-allow-embedded: the window.__timelines registry the seek assertion drives, kept beside it
const TIMELINES = `
<div id="box"></div>
<script>
  const timeline = (name, length) => ({
    duration: () => length,
    pause() {},
    seek(time) { document.getElementById('box').dataset[name] = String(time) },
  })
  window.__timelines = { intro: timeline('intro', 1.5), launch: timeline('launch', 4) }
</script>`

// A scene a script steps on a timer, which no animation list sees.
// canon-allow-embedded: the timer-driven page the seek must refuse, kept beside it
const TIMER = `
<div id="box"></div>
<script>
  let x = 0
  setInterval(() => { x += 1; document.getElementById('box').style.marginLeft = x + 'px' }, 16)
</script>`

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'seeking a frame',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let page: Page

    beforeEach(async () => {
      page = await requireShell(shell).newPage()
    })

    afterEach(async () => {
      await page.close()
    })

    const left = () =>
      page.$eval('#box', (box) => Math.round(box.getBoundingClientRect().left))
    const data = (key: string) =>
      page.$eval('#box', (box, name) => (box as HTMLElement).dataset[name], key)

    it('reads a finite CSS animation with its end', async () => {
      await page.setContent(SLIDE)

      expect(await findMotion(page, 'studio/home/slide', 1_000)).toEqual({
        source: 'css',
        duration: 2000,
      })
    })

    it('holds a CSS slide at its start, middle, and end', async () => {
      await page.setContent(SLIDE)
      const motion = await findMotion(page, 'studio/home/slide', 1_000)

      await seekMotion(page, motion, 0)
      const atStart = await left()
      await seekMotion(page, motion, 1000)
      const atMiddle = await left()
      await seekMotion(page, motion, 2000)
      const atEnd = await left()

      expect([atStart, atMiddle, atEnd]).toEqual([0, 100, 200])
    })

    it('clamps a moment past the end and reports the moment held', async () => {
      await page.setContent(SLIDE)
      const motion = await findMotion(page, 'studio/home/slide', 1_000)

      expect(await seekMotion(page, motion, 9000)).toBe(2000)
    })

    it('seeks an infinite animation with no end', async () => {
      await page.setContent(SPIN)
      const motion = await findMotion(page, 'studio/home/spin', 1_000)

      expect(motion).toEqual({ source: 'css', duration: null })
      expect(await seekMotion(page, motion, 2500)).toBe(2500)
    })

    it('catches a transition started a frame after load', async () => {
      await page.setContent(REVEAL)
      const motion = await findMotion(page, 'studio/home/reveal', 1_000)

      await seekMotion(page, motion, 500)

      expect(motion.duration).toBe(1000)
      expect(await left()).toBe(50)
    })

    it('seeks window.__hf in seconds', async () => {
      await page.setContent(HF)
      const motion = await findMotion(page, 'studio/home/hf', 1_000)

      await seekMotion(page, motion, 1500)

      expect(motion).toEqual({ source: 'hf', duration: 3000 })
      expect(await data('time')).toBe('1.5')
    })

    it('seeks every window.__timelines entry across the longest', async () => {
      await page.setContent(TIMELINES)
      const motion = await findMotion(page, 'studio/home/launch', 1_000)

      await seekMotion(page, motion, 1000)

      expect(motion).toEqual({ source: 'timelines', duration: 4000 })
      expect([await data('intro'), await data('launch')]).toEqual(['1', '1'])
    })

    it('refuses a timer-driven frame as motion-missing, exit 10', async () => {
      await page.setContent(TIMER)

      await expect(
        findMotion(page, 'studio/home/timer', 200),
      ).rejects.toMatchObject({
        code: 'motion-missing',
        exitCode: 10,
        details: { ref: 'studio/home/timer' },
      })
    })
  },
)

describe('filmstripMoments', () => {
  it('spaces moments evenly from 0 to the end inclusive', () => {
    expect(
      filmstripMoments(
        'studio/home/slide',
        { source: 'css', duration: 2000 },
        5,
      ),
    ).toEqual([0, 500, 1000, 1500, 2000])
  })

  it('rounds each moment to a whole millisecond', () => {
    expect(
      filmstripMoments(
        'studio/home/slide',
        { source: 'css', duration: 1000 },
        4,
      ),
    ).toEqual([0, 333, 667, 1000])
  })

  it('refuses an infinite-only timeline as motion-unbounded, exit 10', () => {
    expect(() =>
      filmstripMoments(
        'studio/home/spin',
        { source: 'css', duration: null },
        4,
      ),
    ).toThrow(
      expect.objectContaining({ code: 'motion-unbounded', exitCode: 10 }),
    )
  })
})
