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
        'studio/home/past.html':
          '<style>body{margin:0}div{position:absolute}</style>' +
          '<div id="left" style="left:-60px;top:20px;width:100px;height:40px"></div>' +
          '<div id="top" style="left:30px;top:-70px;width:50px;height:30px"></div>' +
          '<div id="both" style="left:-200px;top:-100px;width:80px;height:50px"></div>' +
          '<div id="fraction" style="left:-20.5px;top:10px;width:40px;height:30px"></div>' +
          '<div id="turned" style="left:-60px;top:20px;width:40px;height:20px;rotate:90deg"></div>' +
          '<div id="slid" style="left:20px;top:20px;width:40px;height:20px;translate:-80px"></div>' +
          '<div style="left:-40px;top:20px;width:10px;height:10px;scale:2"><i id="scaled" style="display:block;width:40px;height:20px"></i></div>' +
          '<div id="right" style="left:180px;top:20px;width:90px;height:40px"></div>',
        // Shorter than its frame, where a shifted root anchors each box to 40 px.
        'studio/home/moved.html':
          '<style>html{translate:-10px 5px;transition:translate 9s}body{margin:0;height:40px}</style>' +
          '<div id="moved" style="position:absolute;left:-30px;top:0;width:60px;height:20px"></div>',
        'studio/home/stretched.html':
          '<!doctype html><style>body{margin:0;height:40px}' +
          'div{position:absolute}#tall{left:-30px;top:-20px;bottom:20px;width:60px}' +
          '#least{left:-30px;top:0;width:60px;height:10px;min-height:90%!important}</style>' +
          '<div id="tall"></div><div id="least"></div>' +
          '<div style="left:-50px;top:0;width:80px;height:90%;display:flex"><p id="item" style="margin:0;flex:1 0 50%"></p></div>',
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
            shift: getComputedStyle(document.documentElement).translate,
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

    it.each([
      ['left', { x: 0, y: 20, width: 100, height: 40 }],
      ['top', { x: 30, y: 0, width: 50, height: 30 }],
      ['both', { x: 0, y: 0, width: 80, height: 50 }],
      ['fraction', { x: 0, y: 10, width: 40, height: 30 }],
      ['turned', { x: 0, y: 10, width: 20, height: 40 }],
      ['slid', { x: 0, y: 20, width: 40, height: 20 }],
      ['scaled', { x: 0, y: 15, width: 80, height: 40 }],
    ])(
      'shifts the %s element into view at its own size',
      async (id, expected) => {
        const index = await inspectedIndex('past', id)

        const { box } = await isolated('past', index)

        expect(box).toEqual(expected)
      },
    )

    it('leaves the page where it was for an element past the right edge alone', async () => {
      const index = await inspectedIndex('past', 'right')

      const { box, shift } = await isolated('past', index)

      expect(box).toEqual({ x: 180, y: 20, width: 90, height: 40 })
      expect(shift).toBe('none')
    })

    it('shifts an element past the edge of a page that moves its own root', async () => {
      const index = await inspectedIndex('moved', 'moved')

      const { box } = await isolated('moved', index)

      expect(box).toEqual({ x: 0, y: 0, width: 60, height: 20 })
    })

    it.each([
      ['stretched by its insets', 'tall', { width: 60, height: 100 }],
      ['at a percentage minimum', 'least', { width: 60, height: 90 }],
      ['stretched by a flex parent', 'item', { width: 80, height: 90 }],
    ])(
      'holds the size of an element %s past the edge',
      async (_name, id, size) => {
        const index = await inspectedIndex('stretched', id)

        const { box } = await isolated('stretched', index)

        expect(box).toMatchObject(size)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
      },
    )

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
