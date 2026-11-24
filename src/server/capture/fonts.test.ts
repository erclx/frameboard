import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  launchShellOrNull,
  requireShell,
  SHELL_HOOK_TIMEOUT_MS,
  SHELL_TEST_TIMEOUT_MS,
} from '../../../test/support/headless-shell'
import { installedFontFiles } from '../../../test/support/installed-font'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { parseFontFamilies, requestedFamily } from './fonts'
import { type FrameHost, startFrameHost } from './host'
import { openFrame } from './render'

const DEFAULT = '"Times New Roman"'

describe('parseFontFamilies', () => {
  it('splits a stack and unquotes each family', () => {
    expect(parseFontFamilies('"Brand Sans", Inter, sans-serif')).toEqual([
      'Brand Sans',
      'Inter',
      'sans-serif',
    ])
  })

  it('keeps a comma inside a quoted family', () => {
    expect(parseFontFamilies("'Odd, Name', serif")).toEqual([
      'Odd, Name',
      'serif',
    ])
  })

  it('reads an empty value as no families', () => {
    expect(parseFontFamilies('')).toEqual([])
  })
})

describe('requestedFamily', () => {
  it('takes the first family of the stack', () => {
    expect(requestedFamily('Brand, Geist, sans-serif', DEFAULT)).toBe('Brand')
  })

  it('asks for nothing when the stack opens with a generic', () => {
    expect(requestedFamily('sans-serif, Brand', DEFAULT)).toBeNull()
  })

  it('reads the system aliases as generic in any case', () => {
    expect(
      requestedFamily('-apple-system, "Segoe UI", sans-serif', DEFAULT),
    ).toBeNull()
    expect(requestedFamily('blinkMacSystemFont, Roboto', DEFAULT)).toBeNull()
  })

  it('reads the ui- families as generic', () => {
    expect(requestedFamily('ui-monospace, Menlo', DEFAULT)).toBeNull()
  })

  it('asks for nothing from an empty value', () => {
    expect(requestedFamily('', DEFAULT)).toBeNull()
  })

  it('asks for nothing when the stack opens with the browser default', () => {
    expect(requestedFamily('"Times New Roman"', DEFAULT)).toBeNull()
    expect(requestedFamily('"Times New Roman", Brand', DEFAULT)).toBeNull()
  })

  it('reads the default in any case', () => {
    expect(requestedFamily('times new roman', DEFAULT)).toBeNull()
  })

  it('still asks for a named family when only a later one is the default', () => {
    expect(requestedFamily('Brand, "Times New Roman"', DEFAULT)).toBe('Brand')
  })

  it('asks for the family when the browser default is unknown', () => {
    expect(requestedFamily('"Times New Roman"', '')).toBe('Times New Roman')
  })
})

const shell = await launchShellOrNull()

afterAll(async () => {
  await shell?.close()
}, SHELL_HOOK_TIMEOUT_MS)

describe.skipIf(shell === null)(
  'a frame naming a font its project installed',
  { timeout: SHELL_TEST_TIMEOUT_MS },
  () => {
    let host: FrameHost
    let board: TempBoard
    let faces: string

    beforeAll(async () => {
      faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
      board = writeBoard({
        ...installedFontFiles('studio', 'stub-display', 'Stub Display'),
        ...installedFontFiles('studio', 'stub-serif', 'Stub Serif'),
        'studio/home/title.html':
          '<h1 style="font-family: \'Stub Display\', serif">Hello</h1>',
        'studio/home/broken.html':
          '<h1 style="font-family: \'Stub Serif\', serif">Hello</h1>',
        'other/home/title.html':
          '<h1 style="font-family: \'Stub Display\', serif">Hello</h1>',
      })
      // A real face stands in for the family's, so the browser can load it.
      copyFileSync(
        createRequire(import.meta.url).resolve(
          '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2',
        ),
        join(
          board.root,
          'studio/assets/fonts/stub-display/stub-display-latin-wght-normal.woff2',
        ),
      )
      host = await startFrameHost({ root: board.root, facesDir: faces })
    }, SHELL_HOOK_TIMEOUT_MS)

    afterAll(async () => {
      await host.close()
      board.cleanup()
      rmSync(faces, { recursive: true, force: true })
    }, SHELL_HOOK_TIMEOUT_MS)

    function open(ref: string) {
      return openFrame(requireShell(shell), {
        baseUrl: host.url,
        ref,
        box: { width: 200, height: 100 },
        theme: 'light',
      })
    }

    it('draws its text in that font', async () => {
      const opened = await open('studio/home/title')
      const loaded = await opened.page.evaluate(() =>
        [...document.fonts]
          .filter((face) => face.status === 'loaded')
          .map((face) => face.family.replaceAll('"', '')),
      )
      await opened.close()

      expect(loaded).toEqual(['Stub Display'])
    })

    it.each([
      ['whose file does not load', 'studio/home/broken'],
      ['only another project installed', 'other/home/title'],
    ])('refuses font-missing for one %s', async (_case, ref) => {
      await expect(open(ref)).rejects.toMatchObject({
        code: 'font-missing',
        details: { ref },
      })
    })
  },
)
