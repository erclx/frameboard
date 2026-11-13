import { describe, expect, it } from 'vitest'

import { parseFrame } from './address'
import type { PlaceFacts } from './place'
import { wrapElements } from './wrap'

const NONE: PlaceFacts = { position: null, width: false, height: false }
const ROW = { direction: 'row', gap: 16 } as const

/** Facts for every element of `source`, with the listed indices overridden. */
function factsFor(
  source: string,
  overrides: Record<number, Partial<PlaceFacts>> = {},
): PlaceFacts[] {
  return parseFrame(source).elements.map((_, index) => ({
    ...NONE,
    ...overrides[index],
  }))
}

describe('wrapElements', () => {
  // html 0, head 1, body 2, main 3, h1 4, p 5, footer 6
  const SOURCE =
    '<html><head></head><body>\n  <main>\n    <h1>Hi</h1>\n    <p>x</p>\n  </main>\n  <footer>f</footer>\n</body></html>'

  it('lands one container at the first element’s place holding them in order', () => {
    const wrapped = wrapElements(SOURCE, [3, 6], ROW, null, factsFor(SOURCE))

    expect(wrapped).toMatchObject({
      ok: true,
      html: '<html><head></head><body>\n  <div style="display: flex; flex-direction: row; gap: 16px">\n    <main>\n    <h1>Hi</h1>\n    <p>x</p>\n  </main>\n    <footer>f</footer>\n  </div>\n</body></html>',
      index: 3,
      members: [4, 7],
    })
  })

  it('keeps the order the file holds whatever order the request names them in', () => {
    const wrapped = wrapElements(SOURCE, [6, 3], ROW, null, factsFor(SOURCE))

    expect(wrapped.ok && wrapped.members).toEqual([7, 4])
    expect(
      wrapped.ok && parseFrame(wrapped.html).elements.map((e) => e.tagName),
    ).toEqual(['html', 'head', 'body', 'div', 'main', 'h1', 'p', 'footer'])
  })

  it('drops each free member’s position and places the container where the group sat', () => {
    const source =
      '<body><b style="position: absolute; left: 10px; top: 20px">a</b><i style="position: absolute; left: 50px; top: 20px">b</i></body>'
    const facts = factsFor(source, {
      3: { position: 'absolute' },
      4: { position: 'absolute' },
    })

    const wrapped = wrapElements(
      source,
      [3, 4],
      ROW,
      { left: 10, top: 20 },
      facts,
    )

    expect(wrapped).toMatchObject({
      ok: true,
      html: '<body><div style="display: flex; flex-direction: row; gap: 16px; position: absolute; left: 10px; top: 20px"><b>a</b><i>b</i></div></body>',
    })
  })

  it('leaves every byte outside the parent unchanged', () => {
    const source = `<!doctype html>\n<html><head><style>p{}</style></head><body><section>${'<p>1</p><p>2</p>'}</section><aside>z</aside></body></html>`

    // html 0, head 1, style 2, body 3, section 4, p 5, p 6, aside 7
    const wrapped = wrapElements(source, [5, 6], ROW, null, factsFor(source))

    if (!wrapped.ok) throw new Error(wrapped.detail)
    expect(
      wrapped.html.startsWith(source.slice(0, source.indexOf('<p>1'))),
    ).toBe(true)
    expect(
      wrapped.html.endsWith('</section><aside>z</aside></body></html>'),
    ).toBe(true)
  })

  it('records the parent’s whole element on both sides for one undo', () => {
    const wrapped = wrapElements(SOURCE, [4, 5], ROW, null, factsFor(SOURCE))

    expect(wrapped.ok && wrapped.span).toMatchObject({
      scope: 'element',
      index: 3,
      before: '<main>\n    <h1>Hi</h1>\n    <p>x</p>\n  </main>',
    })
  })

  it('maps every element of the source to where it now sits', () => {
    const wrapped = wrapElements(SOURCE, [3, 6], ROW, null, factsFor(SOURCE))

    if (!wrapped.ok) throw new Error(wrapped.detail)
    expect([0, 1, 2, 3, 4, 5, 6].map(wrapped.remap)).toEqual([
      0, 1, 2, 4, 5, 6, 7,
    ])
  })

  it.each([
    ['elements that are not siblings', [3, 4]],
    ['an index the frame does not hold', [4, 40]],
    ['the body itself', [2]],
    ['an element named twice', [4, 4]],
  ])('refuses %s', (_case, indexes) => {
    expect(
      wrapElements(SOURCE, indexes, ROW, null, factsFor(SOURCE)),
    ).toMatchObject({ ok: false, reason: 'invalid-address' })
  })
})
