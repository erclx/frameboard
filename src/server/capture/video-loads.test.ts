import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
import { openFrame } from './render'

// One second of a moving test pattern, 64 by 36 in VP8.
const CLIP = fileURLToPath(
  new URL('../../../test/fixtures/media/clip.webm', import.meta.url),
)

const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="red"/></svg>'

const BOX = { width: 200, height: 100 }

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'settleVideos through openFrame',
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
        'studio/home/square.svg': SQUARE,
        'studio/home/plain.html': '<p>Hello</p>',
        'studio/home/playing.html':
          '<p>Hello</p><video src="clip.webm" autoplay muted loop></video>',
        'studio/home/gone.html': '<p>Hello</p><video src="gone.webm"></video>',
        'studio/home/sources.html':
          '<video><source src="gone.webm"><source src="gone.mp4"></video>',
        'studio/home/poster.html':
          '<video src="gone.webm" poster="square.svg"></video>',
        'studio/home/poster-playing.html':
          '<video src="clip.webm" poster="square.svg" autoplay muted></video>',
        'studio/home/unloaded.html':
          '<video src="clip.webm" preload="none"></video>',
        'studio/home/chrome.html':
          '<div data-frameboard><video src="gone.webm"></video></div><p>Hello</p>',
        'studio/home/stalled.html': `<video src="http://127.0.0.1:${port}/clip.webm" preload="none"></video>`,
      })
      copyFileSync(CLIP, join(board.root, 'studio/home/clip.webm'))
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      stall.closeAllConnections()
      stall.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    function open(name: string, timeoutMs?: number) {
      return openFrame(browser, {
        baseUrl: host.url,
        ref: `studio/home/${name}`,
        box: BOX,
        theme: 'light',
        timeoutMs,
      })
    }

    /** What the frame's one video rests at once the open resolves. */
    async function resting(name: string) {
      const opened = await open(name)
      try {
        const state = await opened.page.evaluate(() => {
          const video = document.querySelector('video')
          if (!video) throw new Error('the frame holds no video')
          return {
            hasPicture: video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
            paused: video.paused,
            currentTime: video.currentTime,
            autoplay: video.hasAttribute('autoplay'),
          }
        })
        return { videos: opened.videos, ...state }
      } finally {
        await opened.close()
      }
    }

    async function shoot(name: string): Promise<Buffer> {
      const opened = await open(name)
      try {
        return await opened.page.screenshot({ animations: 'disabled' })
      } finally {
        await opened.close()
      }
    }

    it('holds an autoplaying clip paused on its first frame', async () => {
      expect(await resting('playing')).toEqual({
        videos: [],
        hasPicture: true,
        paused: true,
        currentTime: 0,
        autoplay: false,
      })
    })

    it('shoots the same picture of an autoplaying clip twice', async () => {
      const first = await shoot('playing')
      const second = await shoot('playing')

      expect(first.equals(second)).toBe(true)
      expect(first.equals(await shoot('plain'))).toBe(false)
    })

    it('returns a missing file as error without refusing', async () => {
      const opened = await open('gone')
      await opened.close()

      // html, head, body, p, video: the video is element 4.
      expect(opened.videos).toEqual([
        { index: 4, src: 'gone.webm', state: 'error' },
      ])
    })

    it('returns a video whose every source fails as error', async () => {
      const opened = await open('sources')
      await opened.close()

      expect(opened.videos).toEqual([
        { index: 3, src: 'gone.webm', state: 'error' },
      ])
    })

    it('counts a poster as the picture of a video whose file is missing', async () => {
      const opened = await open('poster')
      await opened.close()

      expect(opened.videos).toEqual([])
    })

    it('rests an autoplaying video with a poster on the poster', async () => {
      expect(await resting('poster-playing')).toMatchObject({
        videos: [],
        paused: true,
        currentTime: 0,
      })
    })

    it('makes a preload none video load its first frame', async () => {
      expect(await resting('unloaded')).toMatchObject({
        videos: [],
        hasPicture: true,
      })
    })

    it('returns a video whose request hangs as pending once the budget runs out', async () => {
      const opened = await open('stalled', 1500)
      await opened.close()

      expect(opened.videos).toMatchObject([{ index: 3, state: 'pending' }])
    })

    it('skips a video inside Frameboard chrome', async () => {
      const opened = await open('chrome')
      await opened.close()

      expect(opened.videos).toEqual([])
    })

    it('returns no video for a frame holding none', async () => {
      const opened = await open('plain')
      await opened.close()

      expect(opened.videos).toEqual([])
    })

    it('leaves the videos unread under fonts wait', async () => {
      const opened = await openFrame(browser, {
        baseUrl: host.url,
        ref: 'studio/home/gone',
        box: BOX,
        theme: 'light',
        fonts: 'wait',
      })
      await opened.close()

      expect(opened.videos).toEqual([])
    })
  },
)
