import { type CDPSession, chromium } from '@playwright/test'

import { framesLoaded } from '../../e2e/support/frames'
import { editUnrelated, OPEN_PAGE } from './board'
import type { WriteValues } from './report'

// The first write after a load runs code no later one compiles again.
const WARM_WRITES = 1
const WRITES = 8
const REST_MS = 2000
const WINDOW_MS = 3000
const LOAD_LIMIT_MS = 120_000
const FRAMES = '[data-layer] iframe'

/** Opens the large page in a tab and reads what each write in another project costs it. */
export async function measureWrites(
  url: string,
  root: string,
): Promise<WriteValues[]> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Network.enable')
    const heard = { messages: 0, bytes: 0 }
    cdp.on('Network.webSocketFrameReceived', ({ response }) => {
      heard.messages += 1
      heard.bytes += Buffer.byteLength(response.payloadData)
    })

    await page.goto(`${url}/p/${OPEN_PAGE.project}/${OPEN_PAGE.page}`)
    await page.waitForFunction(
      ([selector, count]) =>
        document.querySelectorAll(selector).length === count,
      [FRAMES, OPEN_PAGE.frames] as const,
      { timeout: LOAD_LIMIT_MS },
    )
    const deadline = performance.now() + LOAD_LIMIT_MS
    while (!(await framesLoaded(page, FRAMES))) {
      if (performance.now() > deadline) throw new Error('a frame never loaded')
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(REST_MS)

    const values: WriteValues[] = []
    for (let step = 1; step <= WARM_WRITES + WRITES; step += 1) {
      const before = { ...heard, ...(await threadTime(cdp)) }
      editUnrelated(root, step)
      await page.waitForTimeout(WINDOW_MS)
      const after = { ...heard, ...(await threadTime(cdp)) }
      if (step <= WARM_WRITES) continue
      values.push({
        taskMs: after.taskMs - before.taskMs,
        scriptMs: after.scriptMs - before.scriptMs,
        messages: after.messages - before.messages,
        bytes: after.bytes - before.bytes,
      })
    }
    return values
  } finally {
    await browser.close()
  }
}

async function threadTime(
  cdp: CDPSession,
): Promise<{ taskMs: number; scriptMs: number }> {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const ms = (name: string) =>
    (metrics.find((metric) => metric.name === name)?.value ?? 0) * 1000
  return { taskMs: ms('TaskDuration'), scriptMs: ms('ScriptDuration') }
}
