import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { checkUnknownTokens } from './custom-properties'
import { readFrame } from './frame-source'
import { tokenSheets } from './tokens'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function check(html: string, files: Record<string, string> = {}) {
  board = writeBoard({ 'site/home/hero.html': html, ...files })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  return checkUnknownTokens(source, tokenSheets(board.root, 'site'))
}

describe('checkUnknownTokens', () => {
  it('reports a var() naming nothing, at its declaration in the style block', () => {
    const findings = check(
      '<style>\n.a { color: var(--no-such-token) }\n</style><p class="a">x</p>',
    )

    expect(findings).toMatchObject([
      {
        rule: 'unknown-token',
        path: 'site/home/hero.html',
        location: { line: 2, column: 6 },
      },
    ])
    expect(findings[0]?.message).toContain('var(--no-such-token)')
  })

  it('reports one in a style attribute at the attribute', () => {
    expect(check('<p style="color: var(--nope)">x</p>')).toMatchObject([
      { rule: 'unknown-token', location: { column: 4 } },
    ])
  })

  it('reports one in a linked sheet against that sheet', () => {
    expect(
      check('<link rel="stylesheet" href="hero.css"><p>x</p>', {
        'site/home/hero.css': '.a { margin: var(--gap) }',
      }),
    ).toMatchObject([{ rule: 'unknown-token', path: 'site/home/hero.css' }])
  })

  it('reports one ahead of an unclosed rule in the same sheet', () => {
    expect(
      check(
        '<style>.b { color: var(--no-such-token) }\n.c { margin: 0 auto\n</style>',
      ),
    ).toMatchObject([{ rule: 'unknown-token', location: { line: 1 } }])
  })

  it('passes a var() with a fallback', () => {
    expect(check('<p style="color: var(--x, red)">x</p>')).toEqual([])
  })

  it('passes a token the board sheet declares', () => {
    expect(
      check('<p style="color: var(--text)">x</p>', {
        'tokens.css': ':root { --text: #111 }',
      }),
    ).toEqual([])
  })

  it('passes a token the project sheet declares', () => {
    expect(
      check('<p style="color: var(--brand)">x</p>', {
        'site/tokens.css': ':root { --brand: #4f46e5 }',
      }),
    ).toEqual([])
  })

  it('passes a property the frame declares in a sheet or an attribute', () => {
    expect(
      check(
        '<style>.a { --gap: 4px; margin: var(--gap) }</style><p style="--fg: red; color: var(--fg)">x</p>',
      ),
    ).toEqual([])
  })

  it('leaves a token sheet referencing an undeclared name to the board', () => {
    expect(
      check('<p>x</p>', { 'tokens.css': ':root { --a: var(--missing) }' }),
    ).toEqual([])
  })
})
