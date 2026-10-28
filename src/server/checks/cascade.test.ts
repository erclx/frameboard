import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { buildCascade } from './cascade'
import { readFrame } from './frame-source'
import { tokenSheets } from './tokens'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The first family the element with `id` renders in. */
function familyOf(
  html: string,
  id: string,
  files: Record<string, string> = {},
): string | null {
  board = writeBoard({ 'site/home/hero.html': html, ...files })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  const element = source.elements.find(
    (candidate) => candidate.attribs.id === id,
  )
  if (!element) throw new Error(`no element #${id}`)
  return buildCascade(source, tokenSheets(board.root, 'site')).firstFamily(
    element,
  )
}

describe('buildCascade firstFamily', () => {
  it('is null when no rule sets a family', () => {
    expect(familyOf('<p id="t">x</p>', 't')).toBeNull()
  })

  it('inherits the body family', () => {
    expect(
      familyOf(
        '<style>body { font-family: "Geist", sans-serif }</style><p id="t">x</p>',
        't',
      ),
    ).toBe('Geist')
  })

  it('resolves a custom property per element, as a scoped override sets it', () => {
    const html = `<style>
      :root { --font: Geist }
      .alt { --font: Inter }
      body { font-family: var(--font) }
      p { font-family: var(--font) }
    </style><p id="root">x</p><div class="alt"><p id="scoped">y</p></div>`

    expect(familyOf(html, 'root')).toBe('Geist')
    expect(familyOf(html, 'scoped')).toBe('Inter')
  })

  it('takes the var() fallback when the property is unset', () => {
    expect(
      familyOf(
        '<style>p { font-family: var(--missing, "Fallback Sans") }</style><p id="t">x</p>',
        't',
      ),
    ).toBe('Fallback Sans')
  })

  it('weighs an id over a later class', () => {
    expect(
      familyOf(
        '<style>#t { font-family: A } .c { font-family: B }</style><p id="t" class="c">x</p>',
        't',
      ),
    ).toBe('A')
  })

  it('weighs :is() by its most specific argument', () => {
    expect(
      familyOf(
        '<style>:is(#x, p) { font-family: A } p.c { font-family: B }</style><p id="t" class="c">x</p>',
        't',
      ),
    ).toBe('A')
  })

  it('weighs :where() as nothing', () => {
    expect(
      familyOf(
        '<style>:where(p.c) { font-family: A } p { font-family: B }</style><p id="t" class="c">x</p>',
        't',
      ),
    ).toBe('B')
  })

  it('lets !important beat a more specific rule and an inline style', () => {
    expect(
      familyOf(
        '<style>p { font-family: A !important } #t { font-family: B }</style><p id="t" style="font-family: C">x</p>',
        't',
      ),
    ).toBe('A')
  })

  it("lets the frame's rule win a tie with a token rule", () => {
    expect(
      familyOf('<style>p { font-family: Frame }</style><p id="t">x</p>', 't', {
        'tokens.css': 'p { font-family: Token }',
      }),
    ).toBe('Frame')
  })

  it('reads a custom property from the board and project token sheets', () => {
    expect(
      familyOf(
        '<style>body { font-family: var(--body) }</style><p id="t">x</p>',
        't',
        {
          'tokens.css': ':root { --body: Board }',
          'site/tokens.css': ':root { --body: Project }',
        },
      ),
    ).toBe('Project')
  })

  it('reads the family out of the font shorthand', () => {
    expect(
      familyOf(
        '<style>body { font: 600 16px / 1.5 "Geist Mono", monospace }</style><p id="t">x</p>',
        't',
      ),
    ).toBe('Geist Mono')
  })

  it('gives code the browser monospace when no rule reaches it', () => {
    expect(
      familyOf(
        '<style>body { font-family: Geist }</style><p><code id="t">x</code></p>',
        't',
      ),
    ).toBe('monospace')
  })

  it('gives a button no family when only body sets one', () => {
    expect(
      familyOf(
        '<style>body { font-family: Geist }</style><button id="t">x</button>',
        't',
      ),
    ).toBeNull()
  })

  it('lets a button inherit when a rule says so', () => {
    expect(
      familyOf(
        '<style>body { font-family: Geist } button { font: inherit }</style><button id="t">x</button>',
        't',
      ),
    ).toBe('Geist')
  })

  it('reads a linked sheet beside the frame', () => {
    expect(
      familyOf('<link rel="stylesheet" href="a.css"><p id="t">x</p>', 't', {
        'site/home/a.css': 'p { font-family: Linked }',
      }),
    ).toBe('Linked')
  })

  it('reads a sheet a style block imports from the project assets', () => {
    expect(
      familyOf(
        '<style>@import "../assets/base.css";</style><p id="t">x</p>',
        't',
        {
          'site/assets/base.css':
            '@import url("type.css");\nbody { color: black }',
          'site/assets/type.css': 'body { font-family: Geist }',
        },
      ),
    ).toBe('Geist')
  })

  it('lets the importing sheet win a tie with the sheet it imports', () => {
    expect(
      familyOf('<link rel="stylesheet" href="a.css"><p id="t">x</p>', 't', {
        'site/home/a.css': '@import "b.css";\np { font-family: Importer }',
        'site/home/b.css': 'p { font-family: Imported }',
      }),
    ).toBe('Importer')
  })

  it('skips a hover rule and a pseudo-element', () => {
    expect(
      familyOf(
        '<style>p { font-family: A } p:hover { font-family: B } p::before { font-family: C }</style><p id="t">x</p>',
        't',
      ),
    ).toBe('A')
  })
})

/** `value` with its `var()` references resolved on the element with `id`. */
function resolvedOn(html: string, id: string, value: string): string | null {
  board = writeBoard({ 'site/home/hero.html': html })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  const element = source.elements.find(
    (candidate) => candidate.attribs.id === id,
  )
  if (!element) throw new Error(`no element #${id}`)
  return buildCascade(source, []).resolve(value, element)
}

describe('buildCascade resolve', () => {
  it('follows a chain of the frame’s own properties to its value', () => {
    expect(
      resolvedOn(
        '<style>:root { --panel: #fff; --bg: var(--panel) }</style><p id="t">x</p>',
        't',
        'var(--bg)',
      ),
    ).toBe('#fff')
  })

  it('resolves inside a larger value', () => {
    expect(
      resolvedOn(
        '<style>:root { --bg: #ececec }</style><p id="t">x</p>',
        't',
        'color-mix(in srgb, var(--bg) 50%, transparent)',
      ),
    ).toBe('color-mix(in srgb, #ececec 50%, transparent)')
  })

  it('answers null for a property nothing declares', () => {
    expect(resolvedOn('<p id="t">x</p>', 't', 'var(--missing)')).toBeNull()
  })
})

/** The declaration of `property` that wins on the element with `id`, and the id it came from. */
function specifiedOf(
  html: string,
  id: string,
  property: string,
): { value: string; from: string | undefined } | null {
  board = writeBoard({ 'site/home/hero.html': html })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  const element = source.elements.find(
    (candidate) => candidate.attribs.id === id,
  )
  if (!element) throw new Error(`no element #${id}`)
  const found = buildCascade(source, [], {
    properties: new Set(['color', 'background-color', 'background']),
  }).specified(element, property)
  return found && { value: found.value, from: found.element.attribs.id }
}

describe('buildCascade specified', () => {
  it('answers an inline declaration over a rule', () => {
    expect(
      specifiedOf(
        '<style>p { background-color: red }</style><p id="t" style="background-color: var(--surface)">x</p>',
        't',
        'background-color',
      ),
    ).toEqual({ value: 'var(--surface)', from: 't' })
  })

  it('answers a rule’s declaration', () => {
    expect(
      specifiedOf(
        '<style>.card { background-color: #fff }</style><p id="t" class="card">x</p>',
        't',
        'background-color',
      ),
    ).toEqual({ value: '#fff', from: 't' })
  })

  it('takes color from the ancestor that sets it', () => {
    expect(
      specifiedOf(
        '<div id="box" style="color: var(--text)"><p id="t">x</p></div>',
        't',
        'color',
      ),
    ).toEqual({ value: 'var(--text)', from: 'box' })
  })

  it('never inherits a background', () => {
    expect(
      specifiedOf(
        '<div id="box" style="background-color: red"><p id="t">x</p></div>',
        't',
        'background-color',
      ),
    ).toBeNull()
  })

  it('lets an !important rule beat the inline style', () => {
    expect(
      specifiedOf(
        '<style>p { color: blue !important }</style><p id="t" style="color: red">x</p>',
        't',
        'color',
      ),
    ).toEqual({ value: 'blue', from: 't' })
  })

  it('reads background-color out of the background shorthand', () => {
    expect(
      specifiedOf(
        '<p id="t" style="background: var(--surface)">x</p>',
        't',
        'background-color',
      ),
    ).toEqual({ value: 'var(--surface)', from: 't' })
  })
})
