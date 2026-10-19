import { describe, expect, it } from 'vitest'

import { parseFrame } from './address'
import { elementName, elementTree } from './elements'

describe('elementTree', () => {
  it('lists each element under body with the index parseFrame gives it', () => {
    const source =
      '<!doctype html><html><head><title>t</title></head><body><main><h1>Hi</h1><p>x</p></main><footer></footer></body></html>'

    const tree = elementTree(source)

    expect(tree).toEqual([
      { index: 4, parent: null, tag: 'main', name: 'main', textOnly: false },
      { index: 5, parent: 4, tag: 'h1', name: 'Hi', textOnly: true },
      { index: 6, parent: 4, tag: 'p', name: 'x', textOnly: true },
      {
        index: 7,
        parent: null,
        tag: 'footer',
        name: 'footer',
        textOnly: false,
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

  it('refuses a frame where the browser builds an element the file does not state', () => {
    const tree = elementTree('<body><table><tr><td>a</td></tr></table></body>')

    expect(tree).toMatchObject({ ok: false, reason: 'address-mismatch' })
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
