import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/board/frames'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { isolateElement } from './element-shot'
import { type FrameHost, startFrameHost } from './host'
import { inspectFrame } from './inspect'
import { openFrame } from './render'

const BOX = { width: 200, height: 100 }

// The frame route injects a marked style and script into the head, so a
// count that took them in would name the element two places on.
const CARD =
  '<style>body{margin:0;background:rgb(255,0,0)}</style>' +
  '<div id="row" style="background:rgb(0,0,255)">' +
  '<p id="title" style="margin:0;width:80px;height:20px">Title</p>' +
  '<p id="other" style="margin:0;width:60px;height:30px">Other</p>' +
  '</div>'

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'isolateElement',
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
        'studio/home/card.html': CARD,
        'studio/home/tall.html':
          '<style>body{margin:0}</style><div id="long" style="width:50px;height:400px"></div>',
        'studio/home/unboxed.html':
          '<p>Shown</p><p id="gone" style="display:none">Gone</p>',
        'studio/home/empty.html': '<p>Shown</p><div id="flat"></div>',
      })
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    function open(name: string) {
      return openFrame(browser, {
        baseUrl: host.url,
        ref: `studio/home/${name}`,
        box: BOX,
        theme: 'light',
      })
    }

    /** The `edit` index `inspect` reports for the element with an id. */
    async function inspectedIndex(name: string, id: string): Promise<number> {
      const frame = await readFrame(board.root, `studio/home/${name}`, {
        cwd: board.root,
      })
      const { elements } = await inspectFrame(browser, {
        baseUrl: host.url,
        frame,
        theme: 'light',
      })
      const found = elements.find((element) => element.id === id)
      if (!found) throw new Error(`inspect reports no #${id}`)
      return found.index
    }

    /** The box answered and what the page shows of each id once one element is isolated. */
    async function isolated(name: string, index: number) {
      const opened = await open(name)
      try {
        const box = await isolateElement(
          opened.page,
          `studio/home/${name}`,
          index,
        )
        const shown = await opened.page.evaluate(() => {
          const visibility = (id: string) => {
            const element = document.getElementById(id)
            return element ? getComputedStyle(element).visibility : null
          }
          return {
            shot: document.querySelector('[data-frameboard-shot]')?.id ?? null,
            title: visibility('title'),
            other: visibility('other'),
            row: visibility('row'),
            ground: getComputedStyle(document.body).backgroundColor,
          }
        })
        return { box, ...shown }
      } finally {
        await opened.close()
      }
    }

    it('isolates the element inspect names under the same index', async () => {
      const index = await inspectedIndex('card', 'title')

      const { shot } = await isolated('card', index)

      expect(shot).toBe('title')
    })

    it('hides the rest of the page and clears its ground', async () => {
      const index = await inspectedIndex('card', 'title')

      const shown = await isolated('card', index)

      expect(shown).toMatchObject({
        title: 'visible',
        other: 'hidden',
        row: 'hidden',
        ground: 'rgba(0, 0, 0, 0)',
      })
    })

    it('answers the box of an element lower in the page', async () => {
      const index = await inspectedIndex('card', 'other')

      const { box } = await isolated('card', index)

      expect(box).toEqual({ x: 0, y: 20, width: 60, height: 30 })
    })

    it('answers the whole box of an element running past the frame', async () => {
      const index = await inspectedIndex('tall', 'long')

      const { box } = await isolated('tall', index)

      expect(box).toEqual({ x: 0, y: 0, width: 50, height: 400 })
    })

    it('refuses an index past the last element as invalid-address', async () => {
      const opened = await open('card')
      try {
        await expect(
          isolateElement(opened.page, 'studio/home/card', 99),
        ).rejects.toMatchObject({ code: 'invalid-address' })
      } finally {
        await opened.close()
      }
    })

    it('refuses an element whose box has no height as invalid-address', async () => {
      const index = await inspectedIndex('empty', 'flat')
      const opened = await open('empty')
      try {
        await expect(
          isolateElement(opened.page, 'studio/home/empty', index),
        ).rejects.toMatchObject({ code: 'invalid-address' })
      } finally {
        await opened.close()
      }
    })

    it('refuses an element with no layout box as invalid-address', async () => {
      const opened = await open('unboxed')
      try {
        const index = await opened.page.evaluate(() =>
          [...document.querySelectorAll('*')]
            .filter((element) => !element.closest('[data-frameboard]'))
            .findIndex((element) => element.id === 'gone'),
        )

        await expect(
          isolateElement(opened.page, 'studio/home/unboxed', index),
        ).rejects.toMatchObject({ code: 'invalid-address' })
      } finally {
        await opened.close()
      }
    })
  },
)
