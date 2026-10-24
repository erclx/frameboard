import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { readFrame } from './frame-source'
import { checkTheme, setsLiteralColor } from './theme'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function themeOf(html: string, files: Record<string, string> = {}) {
  board = writeBoard({ 'site/home/hero.html': html, ...files })
  return checkTheme(
    readFrame({
      root: board.root,
      project: 'site',
      page: 'home',
      name: 'hero',
    }),
  )
}

describe('checkTheme', () => {
  it('reports literal colors with no second theme at the first one', () => {
    const findings = themeOf(
      '<style>\nbody { margin: 0 }\nh1 { color: #111 }\n</style><h1>x</h1>',
    )

    expect(findings).toMatchObject([
      {
        rule: 'theme',
        path: 'site/home/hero.html',
        location: { line: 3, column: 6 },
      },
    ])
  })

  it.each([
    ['a [data-theme] rule', '[data-theme="dark"] h1 { color: #eee }'],
    [
      'a prefers-color-scheme query',
      '@media (prefers-color-scheme: dark) { h1 { color: #eee } }',
    ],
    ['light-dark()', 'p { color: light-dark(#111, #eee) }'],
  ])('passes literal colors beside %s', (_label, rule) => {
    expect(themeOf(`<style>h1 { color: #111 } ${rule}</style>`)).toEqual([])
  })

  it('passes colors taken through var() alone', () => {
    expect(
      themeOf(
        '<style>body { color: var(--fg); background: var(--bg, #fff) }</style>',
      ),
    ).toEqual([])
  })

  it('reports a literal color in a style attribute', () => {
    expect(themeOf('<p style="color: red">x</p>')).toMatchObject([
      { rule: 'theme', location: { line: 1, column: 4 } },
    ])
  })

  it('reports a literal color in a linked sheet against that sheet', () => {
    expect(
      themeOf('<link rel="stylesheet" href="a.css">', {
        'site/home/a.css': 'p {\n  background: rgb(0 0 0);\n}',
      }),
    ).toMatchObject([
      { path: 'site/home/a.css', location: { line: 2, column: 3 } },
    ])
  })
})

describe('setsLiteralColor', () => {
  it.each([
    ['color', '#fff', true],
    ['border', '1px solid oklch(0.5 0.1 200)', true],
    ['background', 'url(red.png)', false],
    ['background', 'var(--bg, white)', false],
    ['color', 'currentColor', false],
    ['margin', '0 auto', false],
    ['box-shadow', '0 1px 2px rgb(0 0 0 / 20%)', false],
    ['box-shadow', '0 1px 2px rgba(0,0,0,.2)', false],
    ['text-shadow', '0 1px #00000033', false],
    ['box-shadow', 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)', false],
    ['box-shadow', '0 1px 2px rgba(0,0,0,.3)', true],
    ['box-shadow', '0 1px 2px rgba(255,0,0,.1)', true],
    ['box-shadow', '0 1px rgba(0,0,0,.1), 0 2px oklch(0.6 0.2 30 / .1)', true],
    ['box-shadow', '0 0 2px black', true],
    ['color', 'rgba(0,0,0,.1)', true],
  ])('reads %s: %s as %s', (property, value, expected) => {
    expect(setsLiteralColor(property, value)).toBe(expected)
  })
})
