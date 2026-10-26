import { afterEach, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/checks/frame-source'
import { tokenSheets } from '@/server/checks/tokens'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { parseFrame } from './address'
import {
  elementLayouts,
  elementName,
  elementRounds,
  elementTree,
} from './elements'

describe('elementTree', () => {
  it('lists each element under body with the index parseFrame gives it', () => {
    const source =
      '<!doctype html><html><head><title>t</title></head><body><main><h1>Hi</h1><p>x</p></main><footer></footer></body></html>'

    const tree = elementTree(source)

    expect(tree).toEqual([
      {
        index: 4,
        parent: null,
        tag: 'main',
        name: 'main',
        textOnly: false,
        layout: 'block',
        round: false,
      },
      {
        index: 5,
        parent: 4,
        tag: 'h1',
        name: 'Hi',
        textOnly: true,
        layout: 'block',
        round: false,
      },
      {
        index: 6,
        parent: 4,
        tag: 'p',
        name: 'x',
        textOnly: true,
        layout: 'block',
        round: false,
      },
      {
        index: 7,
        parent: null,
        tag: 'footer',
        name: 'footer',
        textOnly: false,
        layout: 'block',
        round: false,
      },
    ])
    expect(parseFrame(source).elements[5]?.tagName).toBe('h1')
  })

  it("skips a template's contents, as the edit index does", () => {
    const tree = elementTree(
      '<body><template><li>a</li></template><p>b</p></body>',
    )

    expect(
      Array.isArray(tree) && tree.map((row) => [row.index, row.tag]),
    ).toEqual([
      [3, 'template'],
      [4, 'p'],
    ])
  })

  it('gives each element the layout read at its index', () => {
    const tree = elementTree('<body><div><p>a</p></div></body>', [
      'block',
      'block',
      'block',
      'column',
    ])

    expect(
      Array.isArray(tree) && tree.map((row) => [row.tag, row.layout]),
    ).toEqual([
      ['div', 'column'],
      ['p', 'block'],
    ])
  })

  it('marks an empty element its read rounds as round', () => {
    const tree = elementTree(
      '<body><div></div><div><p>a</p></div></body>',
      [],
      [false, false, false, true, true],
    )

    expect(
      Array.isArray(tree) && tree.map((row) => [row.index, row.round]),
    ).toEqual([
      [3, true],
      [4, false],
      [5, false],
    ])
  })

  it('refuses a frame where the browser builds an element the file does not state', () => {
    const tree = elementTree('<body><table><tr><td>a</td></tr></table></body>')

    expect(tree).toMatchObject({ ok: false, reason: 'address-mismatch' })
  })
})

describe('elementLayouts', () => {
  let board: TempBoard | undefined

  afterEach(() => {
    board?.cleanup()
    board = undefined
  })

  /** The layout of the element with `id="t"`, read over the board's token sheet. */
  function layoutOf(body: string, css = '', tokens = '') {
    board = writeBoard({
      'tokens.css': tokens,
      'site/home/hero.html': `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`,
    })
    const source = readFrame({
      root: board.root,
      project: 'site',
      page: 'home',
      name: 'hero',
    })
    const layouts = elementLayouts(source, tokenSheets(board.root, 'site'))
    const index = source.elements.findIndex(
      (candidate) => candidate.attribs.id === 't',
    )
    return layouts[index]
  }

  it.each([
    [
      'a column flex',
      '<div id="t" style="display: flex; flex-direction: column"></div>',
      'column',
    ],
    ['a row flex', '<div id="t" style="display: flex"></div>', 'row'],
    [
      'a reversed column',
      '<div id="t" style="display: inline-flex; flex-direction: column-reverse"></div>',
      'column',
    ],
    [
      'flex-flow: row wrap',
      '<div id="t" style="display: flex; flex-flow: row wrap"></div>',
      'row',
    ],
    [
      'flex-flow naming a column',
      '<div id="t" style="display: flex; flex-flow: column wrap"></div>',
      'column',
    ],
    ['a grid', '<div id="t" style="display: grid"></div>', 'grid'],
    ['an img', '<img id="t" src="x.png">', 'block'],
    ['a plain block', '<div id="t"></div>', 'block'],
  ])('reads %s', (_case, body, expected) => {
    expect(layoutOf(body)).toBe(expected)
  })

  it('reads a flex a class sets', () => {
    const layout = layoutOf(
      '<div id="t" class="stack"></div>',
      '.stack { display: flex; flex-direction: column }',
    )

    expect(layout).toBe('column')
  })

  it('reads a flex a token sheet rule sets', () => {
    const layout = layoutOf(
      '<div id="t" class="toolbar"></div>',
      '',
      '.toolbar { display: flex }',
    )

    expect(layout).toBe('row')
  })

  it('lets a later flex-direction win over an earlier flex-flow', () => {
    const layout = layoutOf(
      '<div id="t" class="a"></div>',
      '.a { display: flex; flex-flow: column wrap } .a { flex-direction: row }',
    )

    expect(layout).toBe('row')
  })
})

describe('elementRounds', () => {
  let board: TempBoard | undefined

  afterEach(() => {
    board?.cleanup()
    board = undefined
  })

  /** Whether the element with `id="t"` reads as rounded to an ellipse. */
  function roundOf(body: string, css = '') {
    board = writeBoard({
      'tokens.css': '',
      'site/home/hero.html': `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`,
    })
    const source = readFrame({
      root: board.root,
      project: 'site',
      page: 'home',
      name: 'hero',
    })
    const rounds = elementRounds(source, tokenSheets(board.root, 'site'))
    const index = source.elements.findIndex(
      (candidate) => candidate.attribs.id === 't',
    )
    return rounds[index]
  }

  it.each([
    ['a 50% radius', '<div id="t" style="border-radius: 50%"></div>', true],
    [
      'a radius past 50%',
      '<div id="t" style="border-radius: 100%"></div>',
      true,
    ],
    ['a pixel radius', '<div id="t" style="border-radius: 8px"></div>', false],
    [
      'a radius under 50%',
      '<div id="t" style="border-radius: 25%"></div>',
      false,
    ],
    ['no radius', '<div id="t"></div>', false],
  ])('reads %s', (_case, body, expected) => {
    expect(roundOf(body)).toBe(expected)
  })

  it('reads a radius a class sets', () => {
    expect(
      roundOf('<div id="t" class="dot"></div>', '.dot { border-radius: 50% }'),
    ).toBe(true)
  })
})

describe('elementName', () => {
  function named(html: string): string {
    const element = parseFrame(`<body>${html}</body>`).elements[3]
    if (!element) throw new Error('no element at index 3')
    return elementName(element)
  }

  it.each([
    ['a stated data-name', '<h1 data-name="Headline">Hello</h1>', 'Headline'],
    ['a text-only element', '<p>  Hello,\n   world  </p>', 'Hello, world'],
    [
      'text past 40 characters, cut',
      `<p>${'a'.repeat(45)}</p>`,
      'a'.repeat(40),
    ],
    [
      'an image by its alt',
      '<img alt="Sunset over water">',
      'Sunset over water',
    ],
    ['an image with no alt by its tag', '<img src="x.png">', 'img'],
    [
      'an element holding markup by its tag',
      '<div><span>a</span></div>',
      'div',
    ],
    ['a blank data-name by the next rung', '<p data-name=" ">Hi</p>', 'Hi'],
    ['an id, which never names', '<div id="hero"></div>', 'div'],
  ])('names %s', (_case, html, expected) => {
    expect(named(html)).toBe(expected)
  })
})
