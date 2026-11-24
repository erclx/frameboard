import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Browser, expect, type Page, test } from '@playwright/test'

import { type BoardServer, serveBoard } from '../support/board-server'
import { framesLoaded } from '../support/frames'
import { nextFrame, startRecording, summarize, takeSample } from './frame-gap'

/** Issue 451's page: groups of nine sections at three widths, 108 frames in all. */
const GROUPS = 4
const WIDTHS = [1440, 834, 390]
const SECTIONS = 9
const FRAME_COUNT = GROUPS * WIDTHS.length * SECTIONS
const GESTURE_MS = 3000
/** A single run moved by a third between runs of one arm, so each arm runs this often and reports its median. */
const RUNS = 3

const FONT = join(
  import.meta.dirname,
  '../../test/fixtures/boards/capture/studio/assets/geist.woff2',
)

/** What each renderer drew and dropped and spent, and which renderer is the board's, in one traced gesture. */
const TRACE_CATEGORIES = [
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'cc',
  'gpu',
  'benchmark',
]

function writeBoard(root: string): void {
  const page = join(root, 'perf/grid')
  mkdirSync(join(root, 'perf/assets'), { recursive: true })
  mkdirSync(page, { recursive: true })
  writeFileSync(join(root, 'board.json'), '{ "version": 1 }\n')
  writeFileSync(
    join(root, 'perf/project.json'),
    '{ "version": 1, "pages": ["grid"] }\n',
  )
  writeFileSync(join(root, 'perf/assets/site.css'), SITE_CSS)
  // Inlined in every frame, as the page in the issue carries it.
  const font = `@font-face { font-family: 'Lifted'; src: url(data:font/woff2;base64,${readFileSync(FONT).toString('base64')}) format('woff2'); }`

  const frames: Record<string, object> = {}
  let order = 0
  for (let group = 0; group < GROUPS; group += 1) {
    let x = group * 3300
    for (const width of WIDTHS) {
      for (let section = 0; section < SECTIONS; section += 1) {
        const name = `g${group}-w${width}-s${section}`
        frames[name] = {
          x,
          y: section * 1400,
          width,
          height: 1200,
          order: order++,
        }
        writeFileSync(
          join(page, `${name}.html`),
          frameHtml(font, group, section),
        )
      }
      x += width + 80
    }
  }
  writeFileSync(
    join(page, 'layout.json'),
    `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
  )
}

const SITE_CSS = `body { margin: 0; font-family: 'Lifted', sans-serif; color: #111; background: #fff; }
section { padding: 64px 6vw; }
h2 { font-size: clamp(28px, 4vw, 56px); margin: 0 0 16px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
.card { padding: 24px; border-radius: 16px; background: #f3f4f6; box-shadow: 0 8px 24px rgb(0 0 0 / 0.08); }
.hero { height: 240px; border-radius: 24px; background: linear-gradient(135deg, #2f7bf0, #9b5cf6); }
`

function frameHtml(font: string, group: number, section: number): string {
  const cards = Array.from(
    { length: 6 },
    (_, index) =>
      `<div class="card"><strong>Card ${index + 1}</strong><p>${'Card text that wraps. '.repeat(5)}</p></div>`,
  ).join('\n        ')
  // canon-allow-embedded: a frame generated per group and section, interpolated throughout
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>g${group} s${section}</title>
    <style>${font}</style>
    <link rel="stylesheet" href="../assets/site.css" />
  </head>
  <body>
    <section>
      <h2>Section ${section} of option ${group}</h2>
      <p>${'Body copy lifted from a built site, long enough to wrap over a few lines at each width. '.repeat(6)}</p>
      <div class="hero"></div>
      <div class="cards">
        ${cards}
      </div>
    </section>
  </body>
</html>
`
}

interface TraceEvent {
  name: string
  ph: string
  pid: number
  dur?: number
  args?: {
    data?: { frames?: { parent?: string; processId?: number }[] }
  }
}

/** The pid of the board's own renderer, since its frames draw in a process apart from it. */
function boardPid(traceEvents: TraceEvent[]): number {
  const started = traceEvents.find(
    (event) => event.name === 'TracingStartedInBrowser',
  )
  const board = started?.args?.data?.frames?.find((frame) => !frame.parent)
  if (board?.processId === undefined) {
    throw new Error('the trace names no renderer for the board page')
  }
  return board.processId
}

/** Frames the board's renderer drew and dropped, and its style, layout, and paint time, from one trace. */
function readTrace(buffer: Buffer) {
  const { traceEvents } = JSON.parse(buffer.toString()) as {
    traceEvents: TraceEvent[]
  }
  const pid = boardPid(traceEvents)
  const board = traceEvents.filter((event) => event.pid === pid)
  const count = (name: string) =>
    board.filter((event) => event.name === name).length
  const spentMs = (name: string) =>
    Math.round(
      board
        .filter((event) => event.name === name && event.ph === 'X')
        .reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000,
    )
  return {
    drawn: count('DrawFrame'),
    dropped: count('DroppedFrame'),
    styleLayoutMs: spentMs('LocalFrameView::RunStyleAndLayoutLifecyclePhases'),
    paintMs: spentMs('LocalFrameView::RunPaintLifecyclePhase'),
  }
}

type Traced = ReturnType<typeof readTrace> & ReturnType<typeof summarize>

/** Runs one gesture for its length under a trace, a wheel step per animation frame. */
async function traceGesture(
  browser: Browser,
  page: Page,
  name: string,
  step: (index: number) => Promise<void>,
): Promise<Traced> {
  await startRecording(page)
  await browser.startTracing(page, { categories: TRACE_CATEGORIES })
  await takeSample(page)
  for (
    let start = Date.now(), index = 0;
    Date.now() - start < GESTURE_MS;
    index += 1
  ) {
    await step(index)
    await nextFrame(page)
  }
  const gaps = summarize(name, await takeSample(page))
  const trace = readTrace(await browser.stopTracing())
  return { ...gaps, ...trace }
}

function median(runs: Traced[]) {
  const middle = <Key extends keyof Traced>(key: Key) => {
    const sorted = runs.map((run) => Number(run[key])).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return {
    gesture: runs[0]?.gesture,
    runs: runs.length,
    drawn: middle('drawn'),
    dropped: middle('dropped'),
    styleLayoutMs: middle('styleLayoutMs'),
    paintMs: middle('paintMs'),
    p95: middle('p95'),
    slowShare: middle('slowShare'),
  }
}

test.describe(`a page of ${FRAME_COUNT} frames`, () => {
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

  // Reported against the same run on the trunk by the operator, so it holds no bar of its own.
  test('pan and zoom drawn and dropped frames', async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(300_000)
    await page.goto(`${server.url}/p/perf/grid`)
    await expect(page.locator('[data-layer] [data-frame]')).toHaveCount(
      FRAME_COUNT,
      { timeout: 60_000 },
    )
    await expect.poll(() => framesLoaded(page), { timeout: 120_000 }).toBe(true)

    const box = await page.locator('[data-canvas]').boundingBox()
    if (!box) throw new Error('no canvas on the page')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const layer = page.locator('[data-layer]')
    const transformOf = () => layer.evaluate((el) => el.style.transform)

    const pans: Traced[] = []
    const zooms: Traced[] = []
    for (let run = 0; run < RUNS; run += 1) {
      const before = await transformOf()
      pans.push(
        await traceGesture(browser, page, 'wheel pan', (index) =>
          page.mouse.wheel(
            index % 60 < 30 ? 24 : -24,
            index % 40 < 20 ? 16 : -16,
          ),
        ),
      )
      const panned = await transformOf()
      await page.keyboard.down('Control')
      zooms.push(
        await traceGesture(browser, page, 'wheel zoom', (index) =>
          page.mouse.wheel(0, index % 40 < 20 ? -12 : 12),
        ),
      )
      await page.keyboard.up('Control')
      // Both gestures moved the layer, so the numbers measure a real pan and zoom.
      expect(panned).not.toBe(before)
      expect(await transformOf()).not.toBe(panned)
    }

    const report = {
      frames: FRAME_COUNT,
      pan: median(pans),
      zoom: median(zooms),
    }
    console.log(JSON.stringify(report))
    await testInfo.attach('gestures-perf.json', {
      body: JSON.stringify({ ...report, pans, zooms }, null, 2),
      contentType: 'application/json',
    })
    expect(report.pan.drawn).toBeGreaterThan(0)
    expect(report.zoom.drawn).toBeGreaterThan(0)
  })
})
