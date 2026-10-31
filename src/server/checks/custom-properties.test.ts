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
      check('<link rel="stylesheet" href="hero.css"><p class="a">x</p>', {
        'site/home/hero.css': '.a { margin: var(--gap) }',
      }),
    ).toMatchObject([{ rule: 'unknown-token', path: 'site/home/hero.css' }])
  })

  it('reports one ahead of an unclosed rule in the same sheet', () => {
    expect(
      check(
        '<p class="b">x</p><style>.b { color: var(--no-such-token) }\n.c { margin: 0 auto\n</style>',
      ),
    ).toMatchObject([{ rule: 'unknown-token', location: { line: 1 } }])
  })

  it('reports one after a declaration missing its colon', () => {
    expect(
      check(
        '<style>.a { color red; margin: 0 }\n.b { color: var(--nope) }</style><p class="b">x</p>',
      ),
    ).toMatchObject([{ rule: 'unknown-token', location: { line: 2 } }])
  })

  it('passes one in a rule matching no element in the frame', () => {
    expect(
      check('<link rel="stylesheet" href="site.css"><p class="a">x</p>', {
        'site/home/site.css': '.nav, .footer a { color: var(--brand) }',
      }),
    ).toEqual([])
  })

  it('reports one in a rule where one selector of the list matches', () => {
    expect(
      check('<link rel="stylesheet" href="site.css"><p class="a">x</p>', {
        'site/home/site.css': '.nav, p.a { color: var(--brand) }',
      }),
    ).toMatchObject([{ rule: 'unknown-token', path: 'site/home/site.css' }])
  })

  it('reports one in a rule whose selector it cannot match statically', () => {
    expect(
      check('<style>.nav:hover { color: var(--brand) }</style><p>x</p>'),
    ).toMatchObject([{ rule: 'unknown-token' }])
  })

  it('reports one outside any rule, such as in @font-face', () => {
    expect(
      check(
        '<style>@font-face { font-family: X; src: var(--face) }</style><p>x</p>',
      ),
    ).toMatchObject([{ rule: 'unknown-token' }])
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
