import { mkdtempSync, rmSync } from 'node:fs'
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
import { measureContent } from './fit'
import { type FrameHost, startFrameHost } from './host'

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

const page = (body: string, style = '') =>
  `<!doctype html><html><head><style>body { margin: 0 } ${style}</style></head><body>${body}</body></html>`

describe.skipIf(shell === null)(
  'measureContent',
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
        'studio/home/card.html': page(
          '<div style="width: 320px; height: 1200px"></div>',
        ),
        'studio/home/banner.html': page(
          '<div style="width: 1600px; height: 40px"></div>',
        ),
        'studio/home/entrance.html': page(
          '<div class="grow"></div>',
          '@keyframes grow { from { height: 10px } to { height: 300px } } .grow { width: 100px; animation: grow 30s forwards }',
        ),
        'studio/home/screen.html': page(
          '<main style="min-height: 100vh">Hi</main>',
        ),
        'studio/home/skeleton.html': page(''),
        'studio/home/tight.html': page(
          '<h1>Heading</h1>',
          'h1 { margin: 0; font-size: 48px; line-height: 1 }',
        ),
        'studio/home/tight-link.html': page(
          '<h1><a href="#">Heading</a></h1>',
          'h1 { margin: 0; font-size: 48px; line-height: 1 }',
        ),
        'studio/home/tight-badge.html': page(
          '<h1><span>Heading</span></h1>',
          'h1 { margin: 0; font-size: 48px; line-height: 1 } span { padding: 12px 0; background: red }',
        ),
        'studio/home/spill.html': page(
          '<p>one two three four</p>',
          'p { width: 1px; height: 20px; margin: 0; line-height: 30px }',
        ),
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    const measure = (name: string, hugWidth: boolean) =>
      measureContent(browser, {
        baseUrl: host.url,
        ref: `studio/home/${name}`,
        box: { width: 1440, height: 900 },
        hugWidth,
      })

    it('hugs a width to the content and reads the height at it', async () => {
      const size = await measure('card', true)

      expect([size.width, size.height]).toEqual([320, 1200])
    })

    it('keeps a fixed width while it reads the height', async () => {
      const size = await measure('card', false)

      expect([size.width, size.height]).toEqual([1440, 1200])
    })

    it('caps a hugging width at desktop width and reports the overflow', async () => {
      const size = await measure('banner', true)

      expect([size.width, size.contentWidth]).toEqual([1440, 1600])
    })

    it('reads an entrance animation at its settled size', async () => {
      const size = await measure('entrance', true)

      expect([size.width, size.height]).toEqual([100, 300])
    })

    it('refuses content sized off the viewport', async () => {
      await expect(measure('screen', false)).rejects.toMatchObject({
        code: 'fit-unbounded',
      })
    })

    it('reads text spilling below a block shorter than it', async () => {
      const size = await measure('spill', false)

      expect(size.height).toBeGreaterThan(90)
    })

    it('reads a tight line height block at its own height', async () => {
      const size = await measure('tight', false)

      expect(size.height).toBe(48)
    })

    it('reads a tight line height heading wrapping its text in a link at its own height', async () => {
      const size = await measure('tight-link', false)

      expect(size.height).toBe(48)
    })

    it('reads a padded inline badge under a tight line height past the block', async () => {
      const size = await measure('tight-badge', false)

      expect(size.height).toBeGreaterThan(55)
    })

    it('reads an empty body as empty and keeps its box width', async () => {
      const size = await measure('skeleton', true)

      expect([size.empty, size.width]).toEqual([true, 1440])
    })
  },
)
