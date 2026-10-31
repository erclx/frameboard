import { describe, expect, it } from 'vitest'

import { parseFrame } from './address'
import { placeElement, type PlaceFacts } from './place'

const NONE: PlaceFacts = { position: null, width: false, height: false }

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

describe('placeElement', () => {
  it('writes one tag for a child of body, which anchors to the frame', () => {
    const source = '<body><p>x</p></body>'

    const placed = placeElement(
      source,
      3,
      { left: 10, top: 20 },
      factsFor(source),
    )

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><p style="position: absolute; left: 10px; top: 20px">x</p></body>',
    })
    expect(placed.ok && placed.spans).toHaveLength(1)
  })

  it('writes the static parent then the element, and nothing else', () => {
    const source = '<body><section><div><p>x</p></div></section></body>'

    const placed = placeElement(
      source,
      5,
      { left: 4, top: 8 },
      factsFor(source),
    )

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><section><div style="position: relative"><p style="position: absolute; left: 4px; top: 8px">x</p></div></section></body>',
    })
    expect(placed.ok && placed.spans.map((span) => span.index)).toEqual([4, 5])
  })

  it('leaves a parent a rule already positions alone', () => {
    const source = '<body><div class="card"><p>x</p></div></body>'

    const placed = placeElement(
      source,
      4,
      { left: 0, top: 0 },
      factsFor(source, { 3: { position: 'relative' } }),
    )

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><div class="card"><p style="position: absolute; left: 0px; top: 0px">x</p></div></body>',
    })
    expect(placed.ok && placed.spans).toHaveLength(1)
  })

  it('writes the rendered size only on an axis no rule sizes', () => {
    const source = '<body><p>x</p></body>'

    const placed = placeElement(
      source,
      3,
      { left: 1, top: 2, width: 120.333, height: 40 },
      factsFor(source, { 3: { width: true } }),
    )

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><p style="position: absolute; left: 1px; top: 2px; height: 40px">x</p></body>',
      sized: ['height'],
    })
  })

  it('drops the sizes back in flow names and keeps the rest', () => {
    const source =
      '<body><p style="position: absolute; left: 3px; top: 4px; width: 80px; height: 40px">x</p></body>'

    const placed = placeElement(source, 3, null, factsFor(source), ['height'])

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><p style="width: 80px">x</p></body>',
    })
  })

  it('writes position static back in flow where only a rule places the element', () => {
    const source = '<body><p class="badge">x</p></body>'

    const placed = placeElement(
      source,
      3,
      null,
      factsFor(source, { 3: { position: 'absolute' } }),
    )

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><p class="badge" style="position: static">x</p></body>',
    })
  })

  it('refuses a static parent holding another element anchored above it', () => {
    const source = '<body><div><p>x</p><span><i>badge</i></span></div></body>'

    const placed = placeElement(
      source,
      4,
      { left: 0, top: 0 },
      factsFor(source, { 6: { position: 'absolute' } }),
    )

    expect(placed).toMatchObject({ ok: false, reason: 'reanchors-descendant' })
  })

  it('places beside an absolute descendant a positioned wrapper already anchors', () => {
    const source = '<body><div><p>x</p><span><i>badge</i></span></div></body>'

    const placed = placeElement(
      source,
      4,
      { left: 0, top: 0 },
      factsFor(source, {
        5: { position: 'relative' },
        6: { position: 'absolute' },
      }),
    )

    expect(placed).toMatchObject({ ok: true })
  })

  it('puts a placed element back in the flow and keeps its sizes', () => {
    const source =
      '<body><p style="position: absolute; left: 3px; top: 4px; width: 80px">x</p></body>'

    const placed = placeElement(source, 3, null, factsFor(source))

    expect(placed).toMatchObject({
      ok: true,
      html: '<body><p style="width: 80px">x</p></body>',
    })
  })

  it('refuses an index naming no element', () => {
    const source = '<body><p>x</p></body>'

    const placed = placeElement(
      source,
      9,
      { left: 0, top: 0 },
      factsFor(source),
    )

    expect(placed).toMatchObject({ ok: false, reason: 'invalid-address' })
  })
})
