import { describe, expect, it } from 'vitest'

import { type Recolor, recolorElements } from './recolor'

const PRIMARY: Recolor = {
  from: { value: '#4f46e5', percent: 100 },
  token: '--primary',
}

/** A frame whose `body` holds `markup`, as an agent writes one. */
function frame(markup: string): string {
  return `<!doctype html><html><head></head><body>${markup}</body></html>`
}

describe('recolorElements', () => {
  it('swaps the color on every element stating it, written in hex case or rgb()', () => {
    const source = frame(
      '<p style="color: #4F46E5">a</p><p style="color: rgb(79, 70, 229)">b</p>',
    )

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored).toMatchObject({
      ok: true,
      html: frame(
        '<p style="color: var(--primary)">a</p><p style="color: var(--primary)">b</p>',
      ),
    })
    expect(recolored.ok && recolored.spans.map((span) => span.index)).toEqual([
      3, 4,
    ])
  })

  it('swaps the color part of a border shorthand and keeps its width and style', () => {
    const source = frame('<div style="border: 1px solid #4f46e5">a</div>')

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored).toMatchObject({
      ok: true,
      html: frame('<div style="border: 1px solid var(--primary)">a</div>'),
    })
  })

  it('leaves a value a style rule sets, writing nothing', () => {
    const source = frame(
      '<style>.a { color: #4f46e5 }</style><p class="a">a</p>',
    )

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored).toEqual({ ok: true, html: source, spans: [] })
  })

  it('swaps an alpha value only for the same alpha, keeping it over the token', () => {
    const source = frame(
      '<p style="color: #4f46e5cc">a</p><p style="color: #4f46e5">b</p>',
    )

    const recolored = recolorElements(source, undefined, {
      from: { value: '#4f46e5', percent: 80 },
      token: '--primary',
    })

    expect(recolored).toMatchObject({
      ok: true,
      html: frame(
        '<p style="color: color-mix(in srgb, var(--primary) 80%, transparent)">a</p><p style="color: #4f46e5">b</p>',
      ),
    })
  })

  it('reaches the named element’s subtree alone, never its siblings', () => {
    const source = frame(
      '<div style="color: #4f46e5"><b style="color: #4f46e5">a</b></div><p style="color: #4f46e5">b</p>',
    )

    const recolored = recolorElements(source, 3, PRIMARY)

    expect(recolored).toMatchObject({
      ok: true,
      html: frame(
        '<div style="color: var(--primary)"><b style="color: var(--primary)">a</b></div><p style="color: #4f46e5">b</p>',
      ),
    })
  })

  it('leaves a property that paints no Selection color, and a color inside a function', () => {
    const source = frame(
      '<p style="outline-color: #4f46e5; background: linear-gradient(#4f46e5, #fff)">a</p>',
    )

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored).toEqual({ ok: true, html: source, spans: [] })
  })

  it('records each element’s start tag before and after, for one undo', () => {
    const source = frame('<p id="x" style="color: #4f46e5">a</p>')

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored.ok && recolored.spans).toEqual([
      {
        scope: 'start-tag',
        index: 3,
        count: 4,
        before: '<p id="x" style="color: #4f46e5">',
        after: '<p id="x" style="color: var(--primary)">',
      },
    ])
  })

  it('refuses a style ending inside an open quote, writing nothing', () => {
    const source = frame(`<p style="color: #4f46e5; font-family: 'A">a</p>`)

    const recolored = recolorElements(source, undefined, PRIMARY)

    expect(recolored).toMatchObject({ ok: false, reason: 'open-quote' })
  })

  it('refuses an index naming no element', () => {
    const recolored = recolorElements(frame('<p>a</p>'), 40, PRIMARY)

    expect(recolored).toMatchObject({ ok: false, reason: 'invalid-address' })
  })
})
