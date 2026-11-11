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

/** The two page sizes the switch is timed between, the larger the heaviest page the probe measured. */
const PAGES = { forty: 40, seventy: 74 } as const
type PageName = keyof typeof PAGES
const COLUMNS = 10
const FRAME = { width: 1440, height: 900 }
const SWITCHES = 3

// The bar the plan set for a click answering a switch to a forty-frame page.
const CLICK_MAX_MS = 100

function writeBoard(root: string): void {
  writeFileSync(join(root, 'board.json'), '{ "version": 1 }\n')
  mkdirSync(join(root, 'perf'), { recursive: true })
  writeFileSync(
    join(root, 'perf/project.json'),
    `${JSON.stringify({ version: 1, pages: Object.keys(PAGES) })}\n`,
  )
  for (const [name, count] of Object.entries(PAGES)) {
    const folder = join(root, 'perf', name)
    mkdirSync(folder, { recursive: true })
    const frames: Record<string, object> = {}
    for (let index = 0; index < count; index += 1) {
      const frame = `frame-${String(index).padStart(2, '0')}`
      frames[frame] = {
        x: (index % COLUMNS) * (FRAME.width + 80),
        y: Math.floor(index / COLUMNS) * (FRAME.height + 80),
        ...FRAME,
        order: index,
      }
      writeFileSync(join(folder, `${frame}.html`), frameHtml(name, index))
    }
    writeFileSync(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    )
  }
}

function frameHtml(page: string, index: number): string {
  // canon-allow-embedded: a frame generated per page and index, interpolated throughout
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${page} ${index}</title>
    <style>
      body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: hsl(${index * 7} 60% 96%); }
    </style>
  </head>
  <body>
    <h1>${page} frame ${index}</h1>
    <p>${'A paragraph of body copy that wraps across the frame. '.repeat(12)}</p>
    <svg width="160" height="160" viewBox="0 0 160 160">
      <rect x="20" y="20" width="120" height="120" rx="16" fill="hsl(${index * 7} 70% 50%)" />
    </svg>
  </body>
</html>
`
}

/** Waits for one canvas, the page left behind dropped, with every frame on it loaded. */
async function waitForSettledPage(page: Page, name: PageName): Promise<void> {
  await expect(page.locator('[data-canvas]')).toHaveCount(1, {
    timeout: 30_000,
  })
  await expect
    .poll(
      () =>
        page.evaluate((count) => {
          const iframes = [...document.querySelectorAll('iframe')]
          return (
            iframes.length > 0 &&
            iframes.length <= count &&
            iframes.every(
              (iframe) => iframe.contentDocument?.readyState === 'complete',
            )
          )
        }, PAGES[name]),
      { timeout: 30_000 },
    )
    .toBe(true)
}

async function observeClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const durations: number[] = []
    ;(window as unknown as { __clicks: number[] }).__clicks = durations
    // The DOM lib types carry no `durationThreshold`, and without it the
    // observer reports only events past 104 ms.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'click') durations.push(entry.duration)
      }
    }).observe({
      type: 'event',
      durationThreshold: 16,
    } as PerformanceObserverInit)
  })
}

/** The click's Event Timing duration, which reads 0 when it ran under the observer's 16 ms floor. */
async function takeClick(page: Page): Promise<number> {
  // Event Timing reports once the next frame paints after the event.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
  return page.evaluate(() => {
    const { __clicks } = window as unknown as { __clicks: number[] }
    const longest = Math.max(0, ...__clicks)
    __clicks.length = 0
    return longest
  })
}

async function switchTo(page: Page, name: PageName): Promise<number> {
  await page
    .getByRole('navigation', { name: 'Pages' })
    .getByRole('link', { name, exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/p/perf/${name}$`))
  const click = await takeClick(page)
  await waitForSettledPage(page, name)
  return click
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

test.describe('a page switch', () => {
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

  test('answers the click within the bar', async ({ page }, testInfo) => {
    await page.goto(`${server.url}/p/perf/seventy`)
    await waitForSettledPage(page, 'seventy')
    await observeClicks(page)

    const toForty: number[] = []
    const toSeventy: number[] = []
    for (let round = 0; round < SWITCHES; round += 1) {
      toForty.push(await switchTo(page, 'forty'))
      toSeventy.push(await switchTo(page, 'seventy'))
    }
    const summary = {
      toFortyMs: toForty,
      toSeventyMs: toSeventy,
      toFortyMedian: median(toForty),
      toSeventyMedian: median(toSeventy),
    }
    console.log(JSON.stringify(summary))

    await testInfo.attach('page-switch-perf.json', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json',
    })
    // The seventy-four frame figure is recorded rather than held to the bar,
    // since mounting that many frames alone runs near it.
    expect(summary.toFortyMedian).toBeLessThanOrEqual(CLICK_MAX_MS)
  })
})
