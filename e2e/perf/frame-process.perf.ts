import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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

/** Six busy frames, as the spike measured, and the page the process memory is read on. */
const PAGES = { busy: 6, hundred: 100 } as const
type PageName = keyof typeof PAGES
const COLUMNS = 10
const FRAME = { width: 1440, height: 900 }
const GESTURE_MS = 3000

// The bar the plan set for the board's own frames beside busy ones.
const P95_MAX_MS = 20

const BUSY_FRAME = join(
  import.meta.dirname,
  '../../test/fixtures/frames/busy.html',
)

function writeBoard(root: string): void {
  writeFileSync(join(root, 'board.json'), '{ "version": 1 }\n')
  mkdirSync(join(root, 'perf'))
  writeFileSync(
    join(root, 'perf/project.json'),
    `${JSON.stringify({ version: 1, pages: Object.keys(PAGES) })}\n`,
  )
  writePage(root, 'busy', (path) => copyFileSync(BUSY_FRAME, path))
  writePage(root, 'hundred', (path, index) =>
    writeFileSync(path, plainFrame(index)),
  )
}

function writePage(
  root: string,
  name: PageName,
  writeFrame: (path: string, index: number) => void,
): void {
  const folder = join(root, 'perf', name)
  mkdirSync(folder)
  const frames: Record<string, object> = {}
  for (let index = 0; index < PAGES[name]; index += 1) {
    const frame = `frame-${String(index).padStart(2, '0')}`
    frames[frame] = {
      x: (index % COLUMNS) * (FRAME.width + 80),
      y: Math.floor(index / COLUMNS) * (FRAME.height + 80),
      ...FRAME,
      order: index,
    }
    writeFrame(join(folder, `${frame}.html`), index)
  }
  writeFileSync(
    join(folder, 'layout.json'),
    `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
  )
}

function plainFrame(index: number): string {
  const copy = 'A paragraph of body copy that wraps across the frame. '
  return `<!doctype html>
<title>frame ${index}</title>
<body style="margin: 0; padding: 32px; background: hsl(${index * 7} 60% 96%)">
  <h1>Frame ${index}</h1>
  <p>${copy.repeat(12)}</p>
</body>
`
}

async function openPage(
  page: Page,
  server: BoardServer,
  name: PageName,
): Promise<void> {
  await page.goto(`${server.url}/p/perf/${name}`)
  await expect(page.locator('[data-layer] iframe')).toHaveCount(PAGES[name], {
    timeout: 30_000,
  })
  await expect.poll(() => framesLoaded(page), { timeout: 60_000 }).toBe(true)
}

/** How many frames the browser runs apart from the process of the page embedding them. */
async function framesOutOfProcess(browser: Browser): Promise<number> {
  const cdp = await browser.newBrowserCDPSession()
  const { targetInfos } = await cdp.send('Target.getTargets')
  await cdp.detach()
  return targetInfos.filter(({ type }) => type === 'iframe').length
}

/** Each of the browser's processes with its resident memory, null where `ps` cannot read it. */
async function browserProcesses(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  await cdp.detach()
  return processInfo.map(({ id, type }) => ({ type, rssMb: rssMb(id) }))
}

function rssMb(pid: number): number | null {
  try {
    const kb = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], {
      encoding: 'utf8',
    })
    return Math.round(Number(kb) / 1024)
  } catch {
    return null
  }
}

test.describe('frames in a process of their own', () => {
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

  test("keeps the board's frames smooth beside busy ones", async ({
    browser,
    page,
  }, testInfo) => {
    await openPage(page, server, 'busy')
    const outOfProcess = await framesOutOfProcess(browser)
    const box = await page.locator('[data-canvas]').boundingBox()
    if (!box) throw new Error('no canvas on the page')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
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
    const pan = summarize(
      'wheel pan beside busy frames',
      await takeSample(page),
    )

    await testInfo.attach('frame-process-pan.json', {
      body: JSON.stringify({ outOfProcess, pan }, null, 2),
      contentType: 'application/json',
    })
    expect(outOfProcess).toBe(PAGES.busy)
    expect(pan.frames).toBeGreaterThan(0)
    expect(pan.p95).toBeLessThanOrEqual(P95_MAX_MS)
  })

  test('prints the processes and memory a hundred frames take', async ({
    browser,
    page,
  }, testInfo) => {
    await openPage(page, server, 'hundred')

    const summary = {
      outOfProcess: await framesOutOfProcess(browser),
      processes: await browserProcesses(browser),
    }
    console.log(JSON.stringify(summary))

    await testInfo.attach('frame-process-memory.json', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json',
    })
    expect(summary.outOfProcess).toBe(PAGES.hundred)
  })
})
