import { resolve } from 'node:path'

import { expect, type Page, test } from '@playwright/test'
import { type Browser, chromium } from 'playwright-core'

import { type FrameHost, startFrameHost } from '@/server/capture/host'
import { openFrame } from '@/server/capture/render'

const ROOT = resolve('test/fixtures/boards/capture')
const REF = 'studio/parity/swatch'
const BOX = { width: 480, height: 320 }

/** A channel differs from the shell when it moves by more than this on any channel of 255. */
const CHANNEL_TOLERANCE = 16
/** The share of pixels allowed past the tolerance. */
const MAX_DIFFERING = 0.005

async function render(browser: Browser, baseUrl: string): Promise<Buffer> {
  const opened = await openFrame(browser, {
    baseUrl,
    ref: REF,
    box: BOX,
    theme: 'light',
  })
  try {
    return await opened.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
    })
  } finally {
    await opened.close()
  }
}

/** The share of pixels differing past the tolerance, decoded and compared in the test's page. */
function differingShare(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ({ a, b, tolerance }) => {
      const pixels = async (base64: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = new OffscreenCanvas(image.width, image.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('No 2d context.')
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, image.width, image.height).data
      }
      const [left, right] = await Promise.all([pixels(a), pixels(b)])
      if (left.length !== right.length) return 1
      let differing = 0
      for (let i = 0; i < left.length; i += 4) {
        const moved = [0, 1, 2, 3].some(
          (channel) =>
            Math.abs((left[i + channel] ?? 0) - (right[i + channel] ?? 0)) >
            tolerance,
        )
        if (moved) differing += 1
      }
      return differing / (left.length / 4)
    },
    {
      a: a.toString('base64'),
      b: b.toString('base64'),
      tolerance: CHANNEL_TOLERANCE,
    },
  )
}

test.describe('capture parity', () => {
  let host: FrameHost
  let shell: Browser
  let chrome: Browser | undefined

  test.beforeAll(async () => {
    host = await startFrameHost(ROOT)
    shell = await chromium.launch()
    chrome = await chromium.launch({ channel: 'chrome' }).catch(() => undefined)
  })

  test.afterAll(async () => {
    await Promise.all([shell.close(), chrome?.close(), host.close()])
  })

  test('the headless shell and Chrome agree on a text and color frame', async ({
    page,
  }, testInfo) => {
    test.skip(
      !chrome,
      'Chrome is not installed, so there is no second route to compare.',
    )
    if (!chrome) return

    const [fromShell, fromChrome] = await Promise.all([
      render(shell, host.url),
      render(chrome, host.url),
    ])
    const share = await differingShare(page, fromShell, fromChrome)
    testInfo.annotations.push({
      type: 'parity',
      description: `${(share * 100).toFixed(3)}% of pixels differ by more than ${CHANNEL_TOLERANCE}`,
    })
    console.log(`capture parity: ${(share * 100).toFixed(3)}% of pixels differ`)

    expect(share).toBeLessThanOrEqual(MAX_DIFFERING)
  })
})
