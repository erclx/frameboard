import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import {
  elementMarkup,
  insertElement,
  moveElement,
  relocateMoved,
  removeElement,
  removeInserted,
  restoreInserted,
  shapePaint,
  textFont,
} from './insert'

const PAINT = { fill: 'var(--muted)', line: 'var(--border)' }
const FONT = 'var(--font-text)'
const TEXT =
  '<p data-name="Text" style="font-family: var(--font-text)">Text</p>'

// In a bare fragment the implied html, head, and body take 0 to 2, so the
// first stated element is 3.
const BODY = 2
const FIRST = 3

function token(name: string, group: TokenRow['group'] = 'color'): TokenRow {
  return { name, group, light: '#fff', dark: '#000', sheet: 'tokens.css' }
}

describe('elementMarkup', () => {
  it('should write a paragraph in the font for text', () => {
    expect(elementMarkup({ kind: 'text' }, PAINT, FONT)).toBe(TEXT)
  })

  it('should write a 100 by 100 box in the fill for a rectangle', () => {
    expect(elementMarkup({ kind: 'rectangle' }, PAINT, FONT)).toBe(
      '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div>',
    )
  })

  it('should write the size a drag gave a shape', () => {
    expect(
      elementMarkup({ kind: 'rectangle', width: 240, height: 48 }, PAINT, FONT),
    ).toBe(
      '<div data-name="Rectangle" style="width: 240px; height: 48px; background: var(--muted)"></div>',
    )
  })

  it('should round the box for an ellipse', () => {
    expect(elementMarkup({ kind: 'ellipse' }, PAINT, FONT)).toBe(
      '<div data-name="Ellipse" style="width: 100px; height: 100px; background: var(--muted); border-radius: 50%"></div>',
    )
  })

  it('should draw a divider along the top', () => {
    expect(
      elementMarkup({ kind: 'divider', vertical: false }, PAINT, FONT),
    ).toBe(
      '<hr data-name="Divider" style="align-self: stretch; margin: 0; border: 0; border-top: 1px solid var(--border)">',
    )
  })

  it('should draw a divider in a row down the left', () => {
    expect(
      elementMarkup({ kind: 'divider', vertical: true }, PAINT, FONT),
    ).toBe(
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

describe('textFont', () => {
  it('should name the text font token when the project sets it', () => {
    expect(
      textFont([token('--font-mono', 'font'), token('--font-text', 'font')]),
    ).toBe('var(--font-text)')
  })

  it('should fall back to Geist when the project sets no text font token', () => {
    expect(textFont([token('--font-mono', 'font')])).toBe('Geist, sans-serif')
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
        elementMarkup({ kind: 'rectangle' }, PAINT, FONT),
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

describe('removeElement', () => {
  const source = '<main>\n  <h1>A</h1>\n  <p>B <b>C</b></p>\n</main>'
  // <main> is 3, <h1> 4, <p> 5, <b> 6.

  it('should take out the element at the index with everything it holds', () => {
    expect(removeElement(source, 5)).toMatchObject({
      ok: true,
      html: '<main>\n  <h1>A</h1>\n  \n</main>',
    })
  })

  it('should answer a span that puts the element back before the same sibling', () => {
    const removed = removeElement(source, 4)
    if (!removed.ok) throw new Error(removed.detail)

    expect(restoreInserted(removed.html, removed.span)?.html).toBe(
      '<main>\n  \n  <h1>A</h1><p>B <b>C</b></p>\n</main>',
    )
  })

  it('should answer a span a redo takes the element out by again', () => {
    const removed = removeElement(source, 4)
    if (!removed.ok) throw new Error(removed.detail)
    const restored = restoreInserted(removed.html, removed.span)
    if (!restored) throw new Error('not restored')

    expect(removeInserted(restored.html, restored.span)?.html).toBe(
      removed.html,
    )
  })

  it('should put back the first of several siblings sharing a start tag', () => {
    const list = '<ul><li>a</li><li>b</li><li>c</li></ul>'
    // <ul> is 3, its <li>s 4 to 6.
    const removed = removeElement(list, 4)
    if (!removed.ok) throw new Error(removed.detail)

    expect(restoreInserted(removed.html, removed.span)?.html).toBe(list)
  })

  it('should put back an element holding children under a parent whose start tag repeats', () => {
    const nested = '<div><div><p>a</p></div><div><p>b</p></div></div>'
    // The outer <div> is 3, the inner ones 4 and 6, their <p>s 5 and 7.
    const removed = removeElement(nested, 4)
    if (!removed.ok) throw new Error(removed.detail)

    expect(restoreInserted(removed.html, removed.span)?.html).toBe(nested)
  })

  it('should refuse an index past the last element', () => {
    expect(removeElement(source, 9)).toMatchObject({
      ok: false,
      reason: 'invalid-address',
    })
  })

  it('should refuse the body, which is no element under it', () => {
    expect(removeElement(source, BODY)).toMatchObject({
      ok: false,
      reason: 'invalid-address',
    })
  })
})

describe('moveElement', () => {
  it('should move an element past its next sibling and leave every other byte', () => {
    expect(
      moveElement('<main><h1>A</h1>\n<p>B</p></main>', 4, {
        parent: FIRST,
        before: null,
      }),
    ).toMatchObject({
      ok: true,
      html: '<main>\n<p>B</p><h1>A</h1></main>',
      index: 5,
    })
  })

  it('should move an element into another container', () => {
    expect(
      moveElement('<div><p>A</p></div><section></section>', 4, {
        parent: 5,
        before: null,
      }),
    ).toMatchObject({
      ok: true,
      html: '<div></div><section><p>A</p></section>',
      index: 5,
    })
  })

  it('should carry the moved element with its children', () => {
    expect(
      moveElement('<main><p>A</p><div><span>B</span></div></main>', 5, {
        parent: FIRST,
        before: 4,
      }),
    ).toMatchObject({
      ok: true,
      html: '<main><div><span>B</span></div><p>A</p></main>',
      index: 4,
    })
  })

  it('should refuse a gap inside the moved element', () => {
    expect(
      moveElement('<div><section></section></div>', FIRST, {
        parent: 4,
        before: null,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse a gap in the moved element itself', () => {
    expect(
      moveElement('<div><p>A</p></div>', FIRST, { parent: FIRST, before: 4 }),
    ).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse the gap the element already sits in', () => {
    expect(
      moveElement('<main><h1>A</h1><p>B</p></main>', 4, {
        parent: FIRST,
        before: 5,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })

  it.each([4, 5])(
    'should refuse its own gap with whitespace after it, named before %i',
    (before) => {
      expect(
        moveElement('<main>\n  <h1>A</h1>\n  <p>B</p>\n</main>', 4, {
          parent: FIRST,
          before,
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-address' })
    },
  )

  it('should refuse an element the file does not state', () => {
    expect(
      moveElement('<p>A</p><p>B</p>', BODY, { parent: FIRST, before: null }),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })

  it('should refuse an index past the last element', () => {
    expect(
      moveElement('<p>A</p>', 9, { parent: BODY, before: null }),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })
})

describe('relocateMoved', () => {
  const source = '<main>\n  <h1>A</h1>\n  <p>B</p>\n</main>'

  function moved() {
    const result = moveElement(source, 4, { parent: FIRST, before: null })
    if (!result.ok) throw new Error(result.detail)
    return result
  }

  it('should put the moved element back where it was', () => {
    const { html, span } = moved()

    expect(relocateMoved(html, span, 'before')?.html).toBe(source)
  })

  it('should move it again on a redo', () => {
    const { html, span } = moved()
    const back = relocateMoved(html, span, 'before')
    if (!back) throw new Error('not moved back')

    expect(relocateMoved(back.html, back.span, 'after')?.html).toBe(html)
  })

  it('should put back one of two identical elements', () => {
    const twins = '<main><div></div><div></div><p>B</p></main>'
    const result = moveElement(twins, 4, { parent: FIRST, before: null })
    if (!result.ok) throw new Error(result.detail)

    expect(relocateMoved(result.html, result.span, 'before')?.html).toBe(twins)
  })

  it('should put back the first of three identical elements ahead of its twin', () => {
    const triplets =
      '<main><div data-name="Rectangle"></div><div data-name="Rectangle"></div><div data-name="Rectangle"></div><p>B</p></main>'
    const result = moveElement(triplets, 4, { parent: FIRST, before: null })
    if (!result.ok) throw new Error(result.detail)

    expect(relocateMoved(result.html, result.span, 'before')?.html).toBe(
      triplets,
    )
  })

  it('should refuse once an agent changed the moved element', () => {
    const { html, span } = moved()

    expect(
      relocateMoved(html.replace('>A<', '>Hi<'), span, 'before'),
    ).toBeUndefined()
  })
})
