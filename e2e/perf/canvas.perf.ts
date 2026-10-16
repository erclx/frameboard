import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { type BoardServer, serveBoard } from '../support/board-server'

const FRAME_COUNT = 50
const COLUMNS = 10
const GESTURE_MS = 3000

// The bar the plan set for fifty mounted frames on the operator's machine.
const P95_MAX_MS = 20
const SLOW_SHARE_MAX = 0.05
const SLOW_FRAME_MS = 33
const LONG_FRAME_MAX_MS = 100

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

/** Writes a board of fifty frames: text and an SVG in each, CSS animation in every fifth, a canvas loop in every tenth. */
function writeBoard(root: string): void {
  const page = join(root, 'perf/grid')
  mkdirSync(page, { recursive: true })
  writeFileSync(join(root, 'board.json'), '{ "version": 1 }\n')
  writeFileSync(
    join(root, 'perf/project.json'),
    '{ "version": 1, "pages": ["grid"] }\n',
  )

  const frames: Record<string, object> = {}
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const name = `frame-${String(index).padStart(2, '0')}`
    const size = index % 2 === 0 ? DESKTOP : PHONE
    frames[name] = {
      x: (index % COLUMNS) * (DESKTOP.width + 80),
      y: Math.floor(index / COLUMNS) * (DESKTOP.height + 80),
      ...size,
      order: index,
    }
    writeFileSync(join(page, `${name}.html`), frameHtml(index))
  }
  writeFileSync(
    join(page, 'layout.json'),
    `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
  )
}

function frameHtml(index: number): string {
  const animated = index % 5 === 0
  const looping = index % 10 === 0
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>frame ${index}</title>
    <style>
      body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: hsl(${index * 7} 60% 96%); }
      .spin { animation: spin 2s linear infinite; transform-origin: center; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <h1>Frame ${index}</h1>
    <p>${'A paragraph of body copy that wraps across the frame. '.repeat(12)}</p>
    <svg width="160" height="160" viewBox="0 0 160 160" ${animated ? 'class="spin"' : ''}>
      <rect x="20" y="20" width="120" height="120" rx="16" fill="hsl(${index * 7} 70% 50%)" />
      <circle cx="80" cy="80" r="32" fill="white" />
    </svg>
    ${
      looping
        ? `<canvas id="c" width="320" height="160"></canvas>
    <script>
      const context = document.getElementById('c').getContext('2d')
      function draw(time) {
        context.clearRect(0, 0, 320, 160)
        context.fillStyle = 'hsl(' + (time / 10) % 360 + ' 70% 50%)'
        context.fillRect(160 + Math.sin(time / 300) * 140 - 10, 70, 20, 20)
        requestAnimationFrame(draw)
      }
      requestAnimationFrame(draw)
    </script>`
        : ''
    }
  </body>
</html>
`
}

interface Sample {
  intervals: number[]
  longFrames: number[]
}

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sample = { intervals: [] as number[], longFrames: [] as number[] }
    ;(window as unknown as { __sample: typeof sample }).__sample = sample
    let last = performance.now()
    const tick = (time: number) => {
      sample.intervals.push(time - last)
      last = time
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        sample.longFrames.push(entry.duration)
      }
    }).observe({ type: 'long-animation-frame' })
  })
}

async function takeSample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const { __sample } = window as unknown as { __sample: Sample }
    const taken = {
      intervals: [...__sample.intervals],
      longFrames: [...__sample.longFrames],
    }
    __sample.intervals.length = 0
    __sample.longFrames.length = 0
    return taken
  })
}

function nextFrame(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise(requestAnimationFrame))
}

function summarize(name: string, { intervals, longFrames }: Sample) {
  // The first interval spans the gap before the gesture began.
  const sorted = intervals.slice(1).sort((a, b) => a - b)
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0
  const summary = {
    gesture: name,
    frames: sorted.length,
    p50: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    slowShare: Number(
      (
        sorted.filter((ms) => ms > SLOW_FRAME_MS).length / sorted.length
      ).toFixed(4),
    ),
    longestLongFrame: Math.max(0, ...longFrames),
  }
  console.log(JSON.stringify(summary))
  return summary
}

test.describe('fifty live frames', () => {
  let parent: string
  let server: BoardServer

  test.beforeAll(async () => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-perf-')))
    writeBoard(parent)
    server = await serveBoard(parent)
  })

  test.afterAll(async () => {
    await server.stop()
    rmSync(parent, { recursive: true, force: true })
  })

  test('pan and zoom within the smoothness bar', async ({ page }, testInfo) => {
    await page.goto(server.url)
    const iframes = page.locator('[data-layer] iframe')
    await expect(iframes).toHaveCount(FRAME_COUNT, { timeout: 30_000 })
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('iframe')].every(
              (iframe) => iframe.contentDocument?.readyState === 'complete',
            ),
          ),
        { timeout: 30_000 },
      )
      .toBe(true)

    const box = await page.locator('[data-canvas]').boundingBox()
    if (!box) throw new Error('no canvas on the page')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const layer = page.locator('[data-layer]')
    const transformOf = () => layer.evaluate((el) => el.style.transform)
    const fitted = await transformOf()
    await startRecording(page)

    await takeSample(page)
    for (
      let start = Date.now(), step = 0;
      Date.now() - start < GESTURE_MS;
      step += 1
    ) {
      const direction = Math.floor(step / 60) % 2 === 0 ? 1 : -1
      await page.mouse.wheel(12 * direction, 6 * direction)
      await nextFrame(page)
    }
    const pan = summarize('wheel pan', await takeSample(page))
    const panned = await transformOf()

    await page.keyboard.down('Control')
    for (
      let start = Date.now(), step = 0;
      Date.now() - start < GESTURE_MS;
      step += 1
    ) {
      const direction = Math.floor(step / 45) % 2 === 0 ? -1 : 1
      await page.mouse.wheel(0, 4 * direction)
      await nextFrame(page)
    }
    await page.keyboard.up('Control')
    const pinch = summarize('pinch zoom', await takeSample(page))
    // Both gestures moved the layer, so the numbers measure a real pan and zoom.
    expect(panned).not.toBe(fitted)
    expect(await transformOf()).not.toBe(panned)

    await testInfo.attach('canvas-perf.json', {
      body: JSON.stringify([pan, pinch], null, 2),
      contentType: 'application/json',
    })
    // Every frame was still live through both gestures.
    await expect(iframes).toHaveCount(FRAME_COUNT)
    for (const summary of [pan, pinch]) {
      expect(summary.frames).toBeGreaterThan(0)
      expect(summary.p95).toBeLessThanOrEqual(P95_MAX_MS)
      expect(summary.slowShare).toBeLessThanOrEqual(SLOW_SHARE_MAX)
      expect(summary.longestLongFrame).toBeLessThanOrEqual(LONG_FRAME_MAX_MS)
    }
  })
})
