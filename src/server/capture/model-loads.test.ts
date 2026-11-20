import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Browser, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { scanPage } from '../board/scan'
import { ensureViewer } from '../models/viewer'
import { type FrameHost, startFrameHost } from './host'
import { captureComposite, captureFrameImages } from './images'
import { openFrame } from './render'
import { findMotion, seekMotion } from './seek'

const MODELS = fileURLToPath(
  new URL('../../../test/fixtures/models/', import.meta.url),
)

const BOX = { width: 200, height: 160 }

const SCRIPT =
  '<script type="module" src="../assets/model-viewer.min.js"></script>'

/** A viewer filling the frame, `spin.glb` carrying a two second clip named Spin. */
const viewer = (file: string, attributes = '') =>
  `<model-viewer src="../assets/${file}" ${attributes} style="display:block;width:200px;height:160px"></model-viewer>`

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'settleModels through openFrame',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let browser: Browser
    let host: FrameHost
    let board: TempBoard
    let faces: string
    let stall: Server

    beforeAll(async () => {
      browser = requireShell(shell)
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      // Accepts a connection and never answers, so a request to it stays open.
      stall = createServer(() => {})
      await new Promise<void>((done) => stall.listen(0, '127.0.0.1', done))
      const { port } = stall.address() as AddressInfo
      board = writeBoard({
        'studio/home/plain.html': `${SCRIPT}<p></p>`,
        'studio/home/still.html': `${SCRIPT}${viewer('phone.glb')}`,
        'studio/home/spinning.html': `${SCRIPT}${viewer('spin.glb', 'autoplay')}`,
        'studio/home/pair.html': `${SCRIPT}${viewer('spin.glb', 'autoplay')}${viewer('spin.glb', 'autoplay')}`,
        'studio/home/below.html': `${SCRIPT}<div style="height:2000px"></div>${viewer('phone.glb')}`,
        'studio/home/gone.html': `${SCRIPT}<p></p>${viewer('gone.glb')}`,
        'studio/home/no-script.html': viewer('phone.glb'),
        'studio/home/stalled.html': `${SCRIPT}<model-viewer src="http://127.0.0.1:${port}/phone.glb"></model-viewer>`,
        'studio/home/no-file.html': `${SCRIPT}<model-viewer></model-viewer>`,
        'studio/home/chrome.html': `${SCRIPT}<div data-frameboard>${viewer('gone.glb')}</div>`,
        'studio/deck/layout.json': JSON.stringify({
          version: 1,
          frames: {
            spinning: { x: 0, y: 0, width: 200, height: 160, order: 0 },
          },
        }),
        'studio/deck/spinning.html': `${SCRIPT}${viewer('spin.glb', 'autoplay')}`,
        'studio/tall/layout.json': JSON.stringify({
          version: 1,
          frames: {
            model: { x: 0, y: 0, width: 200, height: 160, order: 0 },
            blank: { x: 300, y: 0, width: 200, height: 160, order: 1 },
          },
        }),
        'studio/tall/model.html': `${SCRIPT}<div style="height:2000px"></div>${viewer('phone.glb')}`,
        'studio/tall/blank.html': `${SCRIPT}<div style="height:2000px"></div><div style="height:160px"></div>`,
      })
      mkdirSync(join(board.root, 'studio/assets'), { recursive: true })
      for (const file of ['phone.glb', 'spin.glb']) {
        copyFileSync(
          join(MODELS, file),
          join(board.root, 'studio/assets', file),
        )
      }
      await ensureViewer(join(board.root, 'studio'))
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      stall.closeAllConnections()
      await new Promise((done) => stall.close(done))
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    function open(name: string, motion?: 'hold') {
      return openFrame(browser, {
        baseUrl: host.url,
        ref: `studio/home/${name}`,
        box: BOX,
        theme: 'light',
        motion,
      })
    }

    async function shoot(name: string): Promise<Buffer> {
      const opened = await open(name)
      try {
        return await opened.page.screenshot({ animations: 'disabled' })
      } finally {
        await opened.close()
      }
    }

    /** Each viewer's clock as the page holds it. */
    function clocks(page: Page) {
      return page.evaluate(() =>
        [...document.querySelectorAll('model-viewer')].map((element) => {
          const { paused, currentTime } = element as HTMLElement & {
            paused: boolean
            currentTime: number
          }
          return { paused, currentTime }
        }),
      )
    }

    it('draws a still model before the shot, the same on a second capture', async () => {
      const first = await shoot('still')
      const second = await shoot('still')

      expect(first.equals(await shoot('plain'))).toBe(false)
      expect(first.equals(second)).toBe(true)
    })

    it('holds an autoplaying model paused at the start of its clip', async () => {
      const opened = await open('spinning')
      const held = await clocks(opened.page)
      await opened.close()

      expect(opened.models).toEqual([])
      expect(held).toEqual([{ paused: true, currentTime: 0 }])
    })

    it('shoots the same picture of an autoplaying model twice', async () => {
      const first = await shoot('spinning')
      const second = await shoot('spinning')

      expect(first.equals(await shoot('plain'))).toBe(false)
      expect(first.equals(second)).toBe(true)
    })

    it('loads a model the viewport does not reach', async () => {
      const opened = await open('below')
      const loaded = await opened.page.evaluate(
        () =>
          (
            document.querySelector('model-viewer') as unknown as {
              loaded: boolean
            }
          ).loaded,
      )
      await opened.close()

      expect(opened.models).toEqual([])
      expect(loaded).toBe(true)
    })

    it('returns a missing model as error without refusing', async () => {
      const opened = await open('gone')
      await opened.close()

      // html, head, script, body, p, model-viewer: the viewer is element 5.
      expect(opened.models).toEqual([
        { index: 5, src: '../assets/gone.glb', state: 'error' },
      ])
    })

    it('returns a model whose request hangs as pending once the budget runs out', async () => {
      const opened = await openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/stalled',
        box: BOX,
        theme: 'light',
        timeoutMs: 5000,
      })
      await opened.close()

      expect(opened.models).toMatchObject([{ index: 4, state: 'pending' }])
    })

    it('returns a model whose frame loads no viewer script as error', async () => {
      const opened = await open('no-script')
      await opened.close()

      expect(opened.models).toEqual([
        { index: 3, src: '../assets/phone.glb', state: 'error' },
      ])
    })

    it('waits on no viewer that names no file, nor one inside Frameboard chrome', async () => {
      const bare = await open('no-file')
      await bare.close()
      const chrome = await open('chrome')
      await chrome.close()

      expect([bare.models, chrome.models]).toEqual([[], []])
    })

    it('leaves the models unread under fonts wait', async () => {
      const opened = await openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/gone',
        box: BOX,
        theme: 'light',
        fonts: 'wait',
      })
      await opened.close()

      expect(opened.models).toEqual([])
    })

    describe('at a moment', () => {
      it("finds a model's clip as the frame's timeline", async () => {
        const opened = await open('spinning', 'hold')
        const motion = await findMotion(
          opened.page,
          'studio/home/spinning',
          2000,
        )
        await opened.close()

        expect(motion).toEqual({ source: 'model', duration: 2000 })
      })

      it('pauses every model in the frame at the moment asked', async () => {
        const opened = await open('pair', 'hold')
        const motion = await findMotion(opened.page, 'studio/home/pair', 2000)
        const at = await seekMotion(opened.page, motion, 500)
        const held = await clocks(opened.page)
        await opened.close()

        expect(at).toBe(500)
        expect(held).toEqual([
          { paused: true, currentTime: 0.5 },
          { paused: true, currentTime: 0.5 },
        ])
      })

      it('draws no loading bar over a model whose clock it holds', async () => {
        const opened = await open('spinning', 'hold')
        const height = await opened.page.evaluate(() => {
          const bar = document
            .querySelector('model-viewer')
            ?.shadowRoot?.querySelector('#default-progress-bar > .bar')
          return bar ? getComputedStyle(bar).height : null
        })
        await opened.close()

        expect(height).toBe('0px')
      })

      it('shoots a different picture at a later moment, the same on a second run', async () => {
        const at = async (ms: number) => {
          const opened = await open('spinning', 'hold')
          try {
            const motion = await findMotion(
              opened.page,
              'studio/home/spinning',
              2000,
            )
            await seekMotion(opened.page, motion, ms)
            return await opened.page.screenshot({ animations: 'allow' })
          } finally {
            await opened.close()
          }
        }

        const quarter = await at(500)

        expect(quarter.equals(await at(0))).toBe(false)
        expect(quarter.equals(await at(500))).toBe(true)
      })
    })

    describe('in a scrolled shot', () => {
      async function scrolled(): Promise<Record<string, Buffer>> {
        const out = mkdtempSync(join(tmpdir(), 'frameboard-shots-'))
        try {
          const page = await scanPage(board.root, 'studio', 'tall', 0)
          const images = await captureFrameImages(browser, {
            baseUrl: host.url,
            frames: page.frames,
            themes: ['light'],
            out,
            scroll: 2000,
          })
          return Object.fromEntries(
            images.map((image) => [image.ref, readFileSync(image.path)]),
          )
        } finally {
          rmSync(out, { recursive: true, force: true })
        }
      }

      it('draws a model the scroll brings into the viewport, the same on a second capture', async () => {
        const first = await scrolled()
        const second = await scrolled()

        expect(
          first['studio/tall/model']?.equals(
            first['studio/tall/blank'] ?? Buffer.alloc(0),
          ),
        ).toBe(false)
        expect(
          first['studio/tall/model']?.equals(
            second['studio/tall/model'] ?? Buffer.alloc(0),
          ),
        ).toBe(true)
      })
    })

    describe('in a page composite', () => {
      async function composite(): Promise<Buffer> {
        const out = mkdtempSync(join(tmpdir(), 'frameboard-shots-'))
        try {
          const page = await scanPage(board.root, 'studio', 'deck', 0)
          const [image] = await captureComposite(browser, {
            baseUrl: host.url,
            page: { ref: page.ref, project: 'studio', name: 'deck' },
            frames: page.frames,
            themes: ['light'],
            out,
          })
          if (!image) throw new Error('the composite wrote no image')
          return readFileSync(image.path)
        } finally {
          rmSync(out, { recursive: true, force: true })
        }
      }

      it('draws an animated model the same on two captures', async () => {
        const first = await composite()
        const second = await composite()

        expect(first.equals(second)).toBe(true)
      })
    })
  },
)
