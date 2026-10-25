import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import {
  elementMarkup,
  insertElement,
  removeInserted,
  restoreInserted,
  shapePaint,
} from './insert'

const PAINT = { fill: 'var(--muted)', line: 'var(--border)' }
const TEXT = '<p data-name="Text">Text</p>'

// In a bare fragment the implied html, head, and body take 0 to 2, so the
// first stated element is 3.
const BODY = 2
const FIRST = 3

function token(name: string, group: TokenRow['group'] = 'color'): TokenRow {
  return { name, group, light: '#fff', dark: '#000', sheet: 'tokens.css' }
}

describe('elementMarkup', () => {
  it('should write a paragraph for text', () => {
    expect(elementMarkup({ kind: 'text' }, PAINT)).toBe(TEXT)
  })

  it('should write a 100 by 100 box in the fill for a rectangle', () => {
    expect(elementMarkup({ kind: 'rectangle' }, PAINT)).toBe(
      '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div>',
    )
  })

  it('should round the box for an ellipse', () => {
    expect(elementMarkup({ kind: 'ellipse' }, PAINT)).toBe(
      '<div data-name="Ellipse" style="width: 100px; height: 100px; background: var(--muted); border-radius: 50%"></div>',
    )
  })

  it('should draw a divider along the top', () => {
    expect(elementMarkup({ kind: 'divider', vertical: false }, PAINT)).toBe(
      '<hr data-name="Divider" style="align-self: stretch; margin: 0; border: 0; border-top: 1px solid var(--border)">',
    )
  })

  it('should draw a divider in a row down the left', () => {
    expect(elementMarkup({ kind: 'divider', vertical: true }, PAINT)).toBe(
      '<hr data-name="Divider" style="align-self: stretch; margin: 0; border: 0; border-left: 1px solid var(--border)">',
    )
  })
})

describe('shapePaint', () => {
  it('should fill with the first of muted, secondary, and accent present', () => {
    expect(
      shapePaint([token('--accent'), token('--secondary'), token('--muted')])
        .fill,
    ).toBe('var(--muted)')
  })

  it('should fill with the first color token when none of the three is set', () => {
    expect(
      shapePaint([token('--radius', 'radius'), token('--brand')]).fill,
    ).toBe('var(--brand)')
  })

  it('should fill with a raw grey when the project sets no color token', () => {
    expect(shapePaint([token('--radius', 'radius')]).fill).toBe('#d9d9d9')
  })

  it('should draw the line in the border token first', () => {
    expect(shapePaint([token('--brand'), token('--border')]).line).toBe(
      'var(--border)',
    )
  })
})

describe('insertElement', () => {
  it('should splice the tag before the named child and leave every other byte', () => {
    expect(
      insertElement(
        '<main>\n  <h1>A</h1>\n  <p>B</p>\n</main>',
        { parent: FIRST, before: 5 },
        TEXT,
      ),
    ).toMatchObject({
      ok: true,
      html: `<main>\n  <h1>A</h1>\n  ${TEXT}<p>B</p>\n</main>`,
      index: 5,
    })
  })

  it("should splice the tag before the parent's end tag", () => {
    expect(
      insertElement(
        '<main><h1>A</h1></main>',
        { parent: FIRST, before: null },
        TEXT,
      ),
    ).toMatchObject({
      ok: true,
      html: `<main><h1>A</h1>${TEXT}</main>`,
      index: 5,
    })
  })

  it('should land after the last stated child of an implied body', () => {
    expect(
      insertElement('<h1>A</h1>\n', { parent: BODY, before: null }, TEXT),
    ).toMatchObject({ ok: true, html: `<h1>A</h1>\n${TEXT}`, index: 4 })
  })

  it('should land after the last child of an element with no end tag', () => {
    expect(
      insertElement('<ul><li>A</ul>', { parent: 4, before: null }, TEXT),
    ).toMatchObject({ ok: true, html: `<ul><li>A${TEXT}</ul>`, index: 5 })
  })

  it('should land inside an empty element', () => {
    expect(
      insertElement('<div></div>', { parent: FIRST, before: null }, TEXT),
    ).toMatchObject({ ok: true, html: `<div>${TEXT}</div>`, index: 4 })
  })

  it('should answer the span an undo removes', () => {
    const result = insertElement(
      '<main><h1>A</h1></main>',
      { parent: FIRST, before: 4 },
      TEXT,
    )

    expect(result).toMatchObject({
      ok: true,
      span: {
        markup: TEXT,
        index: 4,
        count: 6,
        placement: { parent: FIRST, before: 4 },
        parent: { tagName: 'main', tag: '<main>' },
        next: '<h1>',
      },
    })
  })

  it('should refuse a void parent', () => {
    expect(
      insertElement('<img src="a.png">', { parent: FIRST, before: null }, TEXT),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse a raw text parent', () => {
    expect(
      insertElement('<script></script>', { parent: 2, before: null }, TEXT),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse a parent inside an svg', () => {
    expect(
      insertElement('<svg><g></g></svg>', { parent: 4, before: null }, TEXT),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse the document root', () => {
    expect(
      insertElement('<p>A</p>', { parent: 0, before: null }, TEXT),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse a parent past the last element', () => {
    expect(
      insertElement('<p>A</p>', { parent: 9, before: null }, TEXT),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })

  it('should refuse a child the parent does not hold', () => {
    expect(
      insertElement(
        '<div><p>A</p></div><p>B</p>',
        { parent: FIRST, before: 5 },
        TEXT,
      ),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })

  it('should refuse a tag the parser would move out of its parent', () => {
    expect(
      insertElement(
        '<p>A</p>',
        { parent: FIRST, before: null },
        elementMarkup({ kind: 'rectangle' }, PAINT),
      ),
    ).toMatchObject({ ok: false, reason: 'verify-failed' })
  })

  it('should refuse a frame the browser builds an unstated element in', () => {
    expect(
      insertElement(
        '<table><tr><td>A</td></tr></table>',
        { parent: FIRST, before: null },
        TEXT,
      ),
    ).toMatchObject({ ok: false, reason: 'address-mismatch' })
  })
})

describe('removeInserted and restoreInserted', () => {
  const source = '<main>\n  <h1>A</h1>\n</main>'

  function inserted() {
    const result = insertElement(source, { parent: FIRST, before: 4 }, TEXT)
    if (!result.ok) throw new Error(result.detail)
    return result
  }

  it('should take the inserted element back out', () => {
    const { html, span } = inserted()

    expect(removeInserted(html, span)?.html).toBe(source)
  })

  it('should put the element back where it was', () => {
    const { html, span } = inserted()
    const removed = removeInserted(html, span)
    if (!removed) throw new Error('not removed')

    expect(restoreInserted(removed.html, removed.span)?.html).toBe(html)
  })

  it('should find the element by its bytes once an agent added another', () => {
    const { html, span } = inserted()
    const agent = html.replace('</main>', '<p>New</p></main>')

    expect(removeInserted(agent, span)?.html).toBe(
      source.replace('</main>', '<p>New</p></main>'),
    )
  })

  it('should refuse once an agent changed the inserted element', () => {
    const { html, span } = inserted()

    expect(removeInserted(html.replace('>Text<', '>Hi<'), span)).toBeUndefined()
  })

  it('should refuse a redo once the sibling it went before is gone', () => {
    const { html, span } = inserted()
    const removed = removeInserted(html, span)
    if (!removed) throw new Error('not removed')

    expect(
      restoreInserted(removed.html.replace('<h1>A</h1>', ''), removed.span),
    ).toBeUndefined()
  })
})
