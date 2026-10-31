import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from '@/server/edit/address'
import { FrameboardError } from '@/shared/errors'

import {
  editTokenCss,
  setTokenSides,
  tokenSides,
  writeTokenSheet,
} from './token-edit'

const SPLIT_BOARD = { base: '#4f46e5', dark: '#818cf8' }

function refusal(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    if (error instanceof FrameboardError) return error.code
    throw error
  }
  return undefined
}

describe('editTokenCss', () => {
  describe('a light edit', () => {
    it('replaces the value the project already sets and leaves every other byte', () => {
      const css =
        "/* brand */\n:root {\n  --primary: #111;\n  --bg: #fff;\n}\n\n[data-theme='dark'] {\n  --primary: #eee;\n}\n"

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'light',
        value: '#222',
      })

      expect(written).toBe(
        "/* brand */\n:root {\n  --primary: #222;\n  --bg: #fff;\n}\n\n[data-theme='dark'] {\n  --primary: #eee;\n}\n",
      )
    })

    it("adds a board token to the project's :root and pins the board's dark value", () => {
      const css = ':root {\n  --bg: #fff;\n}\n'

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'light',
        value: '#222',
      })

      expect(written).toBe(
        ":root {\n  --bg: #fff;\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --primary: #818cf8;\n}\n",
      )
    })

    it("pins into the project's existing dark rule rather than adding one", () => {
      const css =
        ":root {\n  --bg: #fff;\n}\n[data-theme='dark'] {\n  --bg: #000;\n}\n"

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'light',
        value: '#222',
      })

      expect(tokenSides(written, '--primary')).toEqual({
        base: '#222',
        dark: '#818cf8',
      })
      expect(written.match(/data-theme/g)).toHaveLength(1)
    })

    it('puts a new :root ahead of an existing dark rule, so dark still wins', () => {
      const css =
        "@import 'faces.css';\n\n[data-theme='dark'] {\n  --bg: #000;\n}\n"

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'light',
        value: '#222',
      })

      expect(written).toBe(
        "@import 'faces.css';\n\n:root {\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --bg: #000;\n  --primary: #818cf8;\n}\n",
      )
    })

    it('creates the sheet text for a project with no sheet', () => {
      const written = editTokenCss('', SPLIT_BOARD, {
        name: '--primary',
        side: 'light',
        value: '#222',
      })

      expect(written).toBe(
        ":root {\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --primary: #818cf8;\n}\n",
      )
    })

    it("adds a :root ahead of the project's dark value when the existing :root follows it", () => {
      const css =
        "[data-theme='dark'] {\n  --primary: #111;\n}\n\n:root {\n  --x: 1px;\n}\n"

      const written = editTokenCss(
        css,
        { base: '#4f46e5' },
        { name: '--primary', side: 'light', value: '#222' },
      )

      expect(written).toBe(
        ":root {\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --primary: #111;\n}\n\n:root {\n  --x: 1px;\n}\n",
      )
    })

    it('adds a :root ahead of a dark prefers-color-scheme block holding the token', () => {
      const css =
        '@media (prefers-color-scheme: dark) {\n  :root { --primary: #111 }\n}\n\n:root {\n  --x: 1px;\n}\n'

      const written = editTokenCss(
        css,
        { base: '#4f46e5' },
        { name: '--primary', side: 'light', value: '#222' },
      )

      expect(written.indexOf('--primary: #222')).toBeLessThan(
        written.indexOf('@media'),
      )
    })
  })

  describe('a dark edit', () => {
    it("lands in the project's existing dark rule", () => {
      const css = ':root {\n  --bg: #fff;\n}\n\n.dark {\n  --bg: #000;\n}\n'

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'dark',
        value: '#999',
      })

      expect(written).toBe(
        ':root {\n  --bg: #fff;\n}\n\n.dark {\n  --bg: #000;\n  --primary: #999;\n}\n',
      )
    })

    it('creates a dark rule only when the sheet has none', () => {
      const css = ':root {\n  --bg: #fff;\n}\n'

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        side: 'dark',
        value: '#999',
      })

      expect(written).toBe(
        ":root {\n  --bg: #fff;\n}\n\n[data-theme='dark'] {\n  --primary: #999;\n}\n",
      )
    })

    it('leaves a dark prefers-color-scheme block byte for byte', () => {
      const media =
        '@media (prefers-color-scheme: dark) {\n  :root { --bg: #000 }\n}\n'

      const written = editTokenCss(media, SPLIT_BOARD, {
        name: '--primary',
        side: 'dark',
        value: '#999',
      })

      expect(written.startsWith(media)).toBe(true)
    })
  })

  describe('an edit of both themes', () => {
    it('writes :root alone for a token the board sets under :root alone', () => {
      const css = ':root {\n  --bg: #fff;\n}\n'

      const written = editTokenCss(
        css,
        { base: '4px' },
        { name: '--radius', side: 'both', value: '8px' },
      )

      expect(written).toBe(':root {\n  --bg: #fff;\n  --radius: 8px;\n}\n')
    })

    it('carries the value into every side the project sets apart', () => {
      const css =
        ":root { --font: Inter }\n[data-theme='dark'] { --font: Geist }"

      const written = editTokenCss(
        css,
        { base: 'Inter' },
        { name: '--font', side: 'both', value: 'Mono' },
      )

      expect(tokenSides(written, '--font')).toEqual({
        base: 'Mono',
        dark: 'Mono',
      })
    })
  })

  describe('a reset', () => {
    it('takes out every project declaration and drops a rule it leaves empty', () => {
      const css =
        ":root {\n  --bg: #fff;\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --primary: #818cf8;\n}\n"

      const written = editTokenCss(css, SPLIT_BOARD, {
        name: '--primary',
        reset: true,
      })

      expect(written).toBe(':root {\n  --bg: #fff;\n}\n')
    })

    it('refuses a token the board does not set', () => {
      const css = ':root { --own: 1px }'

      expect(
        refusal(() => editTokenCss(css, {}, { name: '--own', reset: true })),
      ).toBe('invalid-edit')
    })
  })

  describe('refusals', () => {
    it.each([
      ['#fff; } body { display: none'],
      ['#fff }'],
      ['{'],
      ['#fff\n'],
      ['red /* x'],
      ['  '],
    ])('refuses the value %j', (value) => {
      expect(
        refusal(() =>
          editTokenCss('', SPLIT_BOARD, {
            name: '--primary',
            side: 'light',
            value,
          }),
        ),
      ).toBe('invalid-edit')
    })

    it('refuses a name that is not a custom property', () => {
      expect(
        refusal(() =>
          editTokenCss('', SPLIT_BOARD, {
            name: 'color',
            side: 'light',
            value: 'red',
          }),
        ),
      ).toBe('invalid-edit')
    })

    it.each([['"abc'], ['url(x'], ['calc(1px']])(
      'refuses %j, which would leave the sheet unreadable',
      (value) => {
        expect(
          refusal(() =>
            editTokenCss(':root {\n  --bg: #fff;\n}\n', SPLIT_BOARD, {
              name: '--primary',
              side: 'light',
              value,
            }),
          ),
        ).toBe('invalid-edit')
      },
    )

    it('refuses a project sheet that does not parse', () => {
      expect(
        refusal(() =>
          editTokenCss(':root { --bg: #fff', SPLIT_BOARD, {
            name: '--primary',
            side: 'light',
            value: '#222',
          }),
        ),
      ).toBe('invalid-edit')
    })
  })
})

describe('setTokenSides', () => {
  it('puts back a value an edit replaced and takes out a pin it added', () => {
    const css =
      ":root {\n  --primary: #222;\n}\n\n[data-theme='dark'] {\n  --bg: #000;\n  --primary: #818cf8;\n}\n"

    const restored = setTokenSides(css, '--primary', { base: '#111' })

    expect(restored).toBe(
      ":root {\n  --primary: #111;\n}\n\n[data-theme='dark'] {\n  --bg: #000;\n}\n",
    )
  })
})

describe('writeTokenSheet', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frameboard-token-edit-'))
    path = join(dir, 'tokens.css')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a sheet whose hash still matches', () => {
    writeFileSync(path, ':root { --a: 1px }')

    const result = writeTokenSheet(
      path,
      contentHash(':root { --a: 1px }'),
      ':root { --a: 2px }',
    )

    expect(result).toBe('written')
    expect(readFileSync(path, 'utf8')).toBe(':root { --a: 2px }')
  })

  it('leaves a sheet changed since the read as the agent wrote it', () => {
    writeFileSync(path, ':root { --a: 3px }')

    const result = writeTokenSheet(
      path,
      contentHash(':root { --a: 1px }'),
      ':root { --a: 2px }',
    )

    expect(result).toBe('stale')
    expect(readFileSync(path, 'utf8')).toBe(':root { --a: 3px }')
  })

  it('creates a sheet for a null hash', () => {
    expect(writeTokenSheet(path, null, ':root { --a: 2px }')).toBe('created')
    expect(readFileSync(path, 'utf8')).toBe(':root { --a: 2px }')
  })

  it('refuses a null hash once a sheet exists', () => {
    writeFileSync(path, ':root { --a: 3px }')

    expect(writeTokenSheet(path, null, ':root { --a: 2px }')).toBe('stale')
    expect(readFileSync(path, 'utf8')).toBe(':root { --a: 3px }')
  })
})
