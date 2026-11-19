import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { writeBoard } from '../../../test/support/temp-board'
import { readFrame } from '../board/frames'
import { startFrameHost } from './host'
import {
  firstDisagreement,
  inspectFrame,
  type LiveElement,
  renderedOnly,
} from './inspect'

const BOX = { x: 0, y: 0, width: 10, height: 10 }

function live(
  index: number,
  tag: string,
  box: LiveElement['box'],
): LiveElement {
  return {
    index,
    tag,
    id: null,
    classes: [],
    text: '',
    box,
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    fontFamily: 'sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: 'normal',
  }
}

describe('firstDisagreement', () => {
  it('reads equal orders as agreeing, whatever the case of a tag', () => {
    expect(
      firstDisagreement(['html', 'body', 'p'], ['HTML', 'BODY', 'P']),
    ).toBe(null)
  })

  it('names the first index where a script added an element', () => {
    expect(
      firstDisagreement(
        ['html', 'head', 'body', 'p', 'div', 'p'],
        ['html', 'head', 'body', 'p', 'p'],
      ),
    ).toEqual({ index: 4, live: 'div', file: 'p' })
  })

  it('names the first index where the browser built an element the file does not state', () => {
    expect(
      firstDisagreement(
        ['html', 'head', 'body', 'table', 'tbody', 'tr'],
        ['html', 'head', 'body', 'table', 'tr'],
      ),
    ).toEqual({ index: 4, live: 'tbody', file: 'tr' })
  })

  it('names the end of the shorter list when elements were removed', () => {
    expect(firstDisagreement(['html', 'body'], ['html', 'body', 'p'])).toEqual({
      index: 2,
      live: undefined,
      file: 'p',
    })
  })
})

describe('renderedOnly', () => {
  it('drops elements with no box and keeps the indices of the rest', () => {
    const kept = renderedOnly([
      live(0, 'html', BOX),
      live(1, 'head', null),
      live(2, 'body', BOX),
      live(3, 'div', null),
      live(4, 'span', null),
      live(5, 'footer', BOX),
    ])

    expect(kept.map(({ index, tag }) => ({ index, tag }))).toEqual([
      { index: 0, tag: 'html' },
      { index: 2, tag: 'body' },
      { index: 5, tag: 'footer' },
    ])
  })
})

const shell = await launchShellOrNull()

describe.skipIf(shell === null)(
  'inspectFrame on a phone frame',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    async function mainHeight(showDevice: boolean): Promise<number> {
      const board = writeBoard({
        'studio/home/hero.html':
          '<!doctype html><html lang="en"><head><title>hero</title><style>body { margin: 0 } main { height: 100vh }</style></head><body><main></main></body></html>',
        'studio/home/layout.json': JSON.stringify({
          version: 1,
          frames: {
            hero: { x: 0, y: 0, width: 390, height: 844, order: 0, showDevice },
          },
        }),
      })
      const faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      const host = await startFrameHost({ root: board.root, facesDir: faces })
      try {
        const frame = await readFrame(board.root, 'studio/home/hero', {
          cwd: board.root,
        })
        const result = await inspectFrame(requireShell(shell), {
          baseUrl: host.url,
          frame,
          theme: 'light',
        })
        const main = result.elements.find(({ tag }) => tag === 'main')
        if (!main) throw new Error('No main element reported')
        return main.box.height
      } finally {
        await host.close()
        board.cleanup()
        rmSync(faces, { recursive: true, force: true })
      }
    }

    it('reads its elements in the page under the status bar', async () => {
      expect(await mainHeight(true)).toBe(844 - 54)
    })

    it('reads its elements in the whole box with the device off', async () => {
      expect(await mainHeight(false)).toBe(844)
    })
  },
)
