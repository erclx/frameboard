import { mkdtempSync, rmSync } from 'node:fs'
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { type FrameHost, startFrameHost } from './host'
import { settleImages } from './image-loads'
import { openFrame } from './render'

const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'

const BOX = { width: 200, height: 100 }

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'settleImages through openFrame',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let host: FrameHost
    let board: TempBoard
    let faces: string

    beforeAll(async () => {
      browser = requireShell(shell)
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      board = writeBoard({
        'studio/home/square.svg': SQUARE,
        'studio/home/broken.html':
          '<p>Hello</p><img src="square.svg" alt=""><img src="gone.png" alt="Gone">',
        'studio/home/below.html':
          '<div style="height: 10000px"></div><img src="square.svg" loading="lazy" alt="">',
        'studio/home/chrome.html':
          '<div data-frameboard><img src="gone.png" alt=""></div><p>Hello</p>',
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    it('refuses image-missing naming the image that failed', async () => {
      const opening = openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/broken',
        box: BOX,
        theme: 'light',
      })

      // html, head, body, p, img, img: the second image is element 5.
      await expect(opening).rejects.toMatchObject({
        code: 'image-missing',
        details: { ref: 'studio/home/broken', src: 'gone.png', element: 5 },
      })
    })

    it('opens a frame with a failed image under fonts wait', async () => {
      const opened = await openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/broken',
        box: BOX,
        theme: 'light',
        fonts: 'wait',
      })
      const alt = await opened.page.getAttribute('img[src="gone.png"]', 'alt')
      await opened.close()

      expect(alt).toBe('Gone')
    })

    it('loads a lazy image below the box before it resolves', async () => {
      const opened = await openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/below',
        box: BOX,
        theme: 'light',
      })
      const loaded = await opened.page.$eval(
        'img',
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      )
      await opened.close()

      expect(loaded).toBe(true)
    })

    it('skips an image inside Frameboard chrome', async () => {
      const opening = openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/chrome',
        box: BOX,
        theme: 'light',
      }).then((opened) => opened.close())

      await expect(opening).resolves.toBeUndefined()
    })
  },
)

describe.skipIf(shell === null)(
  'openFrame on an image whose request never answers',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let host: FrameHost
    let board: TempBoard
    let faces: string
    let silent: Server
    const held: Socket[] = []

    beforeAll(async () => {
      // Accepts the image request and never answers, so the load event waits.
      silent = createServer((socket) => {
        held.push(socket)
      })
      await new Promise<void>((done) => silent.listen(0, '127.0.0.1', done))
      const { port } = silent.address() as AddressInfo
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      board = writeBoard({
        'studio/home/hang.html': `<p>Hello</p><img src="http://127.0.0.1:${port}/hang.png" alt="">`,
        'studio/home/square.svg': SQUARE,
        'studio/home/held-lazy.html': `<div style="height: 10000px"></div><img src="square.svg" loading="lazy" alt=""><iframe src="http://127.0.0.1:${port}/"></iframe>`,
        'studio/home/held.html': `<img src="square.svg" decoding="async" alt=""><iframe src="http://127.0.0.1:${port}/"></iframe>`,
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      for (const socket of held) socket.destroy()
      await new Promise((done) => silent.close(done))
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    it('refuses image-missing for an eager image once the budget runs out', async () => {
      const opening = openFrame(requireShell(shell), {
        baseUrl: host.url,
        ref: 'studio/home/hang',
        box: BOX,
        theme: 'light',
        timeoutMs: 1_500,
      })

      await expect(opening).rejects.toMatchObject({
        code: 'image-missing',
        details: { ref: 'studio/home/hang', element: 4 },
      })
    })

    it('rethrows the timeout beside a lazy image below the box', async () => {
      const opening = openFrame(requireShell(shell), {
        baseUrl: host.url,
        ref: 'studio/home/held-lazy',
        box: BOX,
        theme: 'light',
        timeoutMs: 1_500,
      })

      await expect(opening).rejects.toMatchObject({ name: 'TimeoutError' })
    })

    it('rethrows the timeout when something else holds the load', async () => {
      const opening = openFrame(requireShell(shell), {
        baseUrl: host.url,
        ref: 'studio/home/held',
        box: BOX,
        theme: 'light',
        timeoutMs: 1_500,
      })

      await expect(opening).rejects.toMatchObject({ name: 'TimeoutError' })
    })
  },
)

describe.skipIf(shell === null)(
  'settleImages on a stalled load',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    it('names no image that loaded and is still decoding', async () => {
      const page = await requireShell(shell).newPage()
      await page.setContent(
        `<img src="data:image/svg+xml,${encodeURIComponent(SQUARE)}" alt="">`,
      )

      // A loaded image whose decode never settles, as one still decoding reads.
      await page.evaluate(() => {
        HTMLImageElement.prototype.decode = () => new Promise(() => {})
      })

      const settling = settleImages(page, 'studio/home/held', 'require', 0, {
        stalled: true,
      })

      await expect(settling).resolves.toBeUndefined()
      await page.close()
    })
  },
)
