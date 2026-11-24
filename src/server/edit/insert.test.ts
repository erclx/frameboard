import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import {
  assetTag,
  elementMarkup,
  ensureViewerScript,
  extractElement,
  insertElement,
  moveElement,
  relocateMoved,
  removeElement,
  removeInserted,
  restoreInserted,
  textFont,
} from './insert'

const PAINT = { fill: 'var(--muted)', line: 'var(--border)' }
const FONT = 'var(--font-text)'
const TEXT =
  '<p data-name="Text" style="font-family: var(--font-text); width: fit-content"></p>'

// In a bare fragment the implied html, head, and body take 0 to 2, so the
// first stated element is 3.
const BODY = 2
const FIRST = 3

function token(name: string, group: TokenRow['group'] = 'color'): TokenRow {
  return {
    name,
    group,
    light: '#fff',
    dark: '#000',
    sheet: 'tokens.css',
    overrides: false,
  }
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

describe('elementMarkup for an asset', () => {
  const asset = (
    path: string,
    tag: 'img' | 'video' | 'audio' | 'model-viewer' = 'img',
  ) => ({ kind: 'asset', path, tag, width: 320, height: 180 }) as const

  it('should write an image at its size, cropped to the box', () => {
    expect(elementMarkup(asset('hero.png'), PAINT, FONT)).toBe(
      '<img data-name="hero.png" src="../assets/hero.png" alt="" style="width: 320px; height: 180px; object-fit: cover">',
    )
  })

  it('should write an SVG in a folder as an image named by its file', () => {
    expect(elementMarkup(asset('icons/logo.svg'), PAINT, FONT)).toBe(
      '<img data-name="logo.svg" src="../assets/icons/logo.svg" alt="" style="width: 320px; height: 180px; object-fit: cover">',
    )
  })

  it('should write a video that plays muted on a loop with its own controls', () => {
    expect(elementMarkup(asset('demo.mp4', 'video'), PAINT, FONT)).toBe(
      '<video data-name="demo.mp4" src="../assets/demo.mp4" controls autoplay muted loop playsinline style="width: 320px; height: 180px; object-fit: cover"></video>',
    )
  })

  it('should write audio as a player at its width alone, so the browser sets its height', () => {
    expect(elementMarkup(asset('voice.ogg', 'audio'), PAINT, FONT)).toBe(
      '<audio data-name="voice.ogg" src="../assets/voice.ogg" controls style="width: 320px"></audio>',
    )
  })

  it('should keep a name holding a quote, an ampersand, and a bracket inside its attributes', () => {
    expect(elementMarkup(asset('a"b&c<d.png'), PAINT, FONT)).toBe(
      '<img data-name="a&quot;b&amp;c&lt;d.png" src="../assets/a%22b%26c%3Cd.png" alt="" style="width: 320px; height: 180px; object-fit: cover">',
    )
  })
})

describe('elementMarkup for a model', () => {
  it('should write one viewer at its size, with no control a hand edit did not set', () => {
    expect(
      elementMarkup(
        {
          kind: 'asset',
          path: 'models/phone.glb',
          tag: 'model-viewer',
          width: 240,
          height: 135,
        },
        PAINT,
        FONT,
      ),
    ).toBe(
      '<model-viewer data-name="phone.glb" src="../assets/models/phone.glb" alt="" style="width: 240px; height: 135px"></model-viewer>',
    )
  })
})

describe('assetTag', () => {
  it.each([
    ['image', 'img'],
    ['gif', 'img'],
    ['svg', 'img'],
    ['video', 'video'],
    ['audio', 'audio'],
    ['model', 'model-viewer'],
  ] as const)('should show a %s through a <%s>', (kind, tag) => {
    expect(assetTag(kind)).toBe(tag)
  })
})

describe('ensureViewerScript', () => {
  const SCRIPT =
    '<script type="module" src="../assets/model-viewer.min.js"></script>'

  it("should write the script once at the end of the frame's head", () => {
    const source =
      '<!doctype html><html><head><title>Hero</title></head><body><main></main></body></html>'

    const result = ensureViewerScript(source)

    expect(result).toEqual({
      ok: true,
      html: `<!doctype html><html><head><title>Hero</title>${SCRIPT}</head><body><main></main></body></html>`,
      index: 3,
    })
  })

  it('should take a line of its own under the last tag of an indented head', () => {
    const result = ensureViewerScript(
      '<html>\n  <head>\n    <title>Hero</title>\n  </head>\n</html>\n',
    )

    expect(result).toMatchObject({
      ok: true,
      html: `<html>\n  <head>\n    <title>Hero</title>\n    ${SCRIPT}\n  </head>\n</html>\n`,
      index: 3,
    })
  })

  it('should add no second script to a frame that already holds one', () => {
    const source = `<html><head>${SCRIPT}</head><body><model-viewer src="../assets/a.glb"></model-viewer></body></html>`

    expect(ensureViewerScript(source)).toEqual({
      ok: true,
      html: source,
      index: null,
    })
  })

  it("should leave a frame loading its agent's own copy of the viewer as it is", () => {
    const source =
      '<html><head></head><body><script src="vendor/model-viewer.min.js?v=4"></script></body></html>'

    expect(ensureViewerScript(source)).toEqual({
      ok: true,
      html: source,
      index: null,
    })
  })

  it('should land in the head the browser builds for a frame stating none', () => {
    const result = ensureViewerScript('<main><p>Hi</p></main>')

    expect(result).toEqual({
      ok: true,
      html: `${SCRIPT}<main><p>Hi</p></main>`,
      index: 2,
    })
  })

  it('should land after the doctype and the html tag of a frame stating no head', () => {
    const result = ensureViewerScript(
      '<!doctype html>\n<html lang="en"><body><main></main></body></html>',
    )

    expect(result).toMatchObject({
      ok: true,
      html: `<!doctype html>\n<html lang="en">${SCRIPT}<body><main></main></body></html>`,
    })
  })

  it('should land after the last child of a head with no end tag', () => {
    const result = ensureViewerScript(
      '<html><head><title>Hero</title><body><main></main></body></html>',
    )

    expect(result).toMatchObject({
      ok: true,
      html: `<html><head><title>Hero</title>${SCRIPT}<body><main></main></body></html>`,
    })
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

  it('should land an image dropped over an image beside it in its parent', () => {
    const img = '<img data-name="a.png" src="../assets/a.png" alt="">'
    const source = `<div>${img}</div>`

    const result = insertElement(source, { parent: FIRST, before: null }, img)

    expect(result).toMatchObject({ ok: true, html: `<div>${img}${img}</div>` })
  })

  it('should refuse an image as the parent of a placed element', () => {
    const img = '<img data-name="a.png" src="../assets/a.png" alt="">'

    const result = insertElement(
      `<div>${img}</div>`,
      { parent: FIRST + 1, before: null },
      img,
    )

    expect(result).toMatchObject({ ok: false, reason: 'invalid-container' })
  })

  it('should refuse a model as the parent of a placed element', () => {
    const result = insertElement(
      '<model-viewer src="../assets/a.glb"></model-viewer>',
      { parent: FIRST, before: null },
      TEXT,
    )

    expect(result).toMatchObject({ ok: false, reason: 'invalid-container' })
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

    expect(
      removeInserted(
        html.replace(TEXT, TEXT.replace('></p>', '>Hi</p>')),
        span,
      ),
    ).toBeUndefined()
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

describe('extractElement', () => {
  const VIEWER =
    '<script type="module" src="../assets/model-viewer.min.js"></script>'

  /** A whole frame holding `body`, whose head holds a rule, a script, and `head` after its title. */
  const frame = (body: string, head = '') =>
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      .cta { color: red }
    </style>
    <script>document.querySelector('.cta').focus()</script>
    <title>hero</title>${head}
  </head>
  <body class="page" style="margin: 0">
    ${body}
  </body>
</html>
`

  // html, head, meta, style, script, title, and body take 0 to 6.
  const BODY_FIRST = 7

  it("should stand the element alone under the source's head and body tag", () => {
    const source = frame('<button class="cta">Buy</button>')

    expect(extractElement(source, BODY_FIRST)).toMatchObject({
      ok: true,
      frame: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      .cta { color: red }
    </style>
    <title>hero</title>
  </head>
  <body class="page" style="margin: 0"><button class="cta">Buy</button></body>
</html>
`,
      index: 6,
    })
  })

  it('should leave every byte of the source but the element', () => {
    const source = frame('<h1>Hi</h1>\n    <p>Text</p>')

    expect(extractElement(source, BODY_FIRST)).toMatchObject({
      ok: true,
      html: frame('\n    <p>Text</p>'),
    })
  })

  it('should carry the element with its children as the file states them', () => {
    const card = '<div class="card">\n      <b>One</b> two\n    </div>'

    const extracted = extractElement(frame(card), BODY_FIRST)

    expect(extracted).toMatchObject({ ok: true, span: { markup: card } })
    expect(extracted.ok && extracted.frame).toContain(`>${card}</body>`)
  })

  it('should leave a valid empty body when the element was its last', () => {
    const source =
      '<!doctype html><html><head></head><body><p>x</p></body></html>'

    expect(extractElement(source, 3)).toMatchObject({
      ok: true,
      html: '<!doctype html><html><head></head><body></body></html>',
    })
  })

  it('should answer a span that puts the element back byte for byte', () => {
    const source = frame('<h1>Hi</h1>\n    <p>Text</p>')

    const extracted = extractElement(source, BODY_FIRST)

    expect(
      extracted.ok && restoreInserted(extracted.html, extracted.span)?.html,
    ).toBe(source)
  })

  it('should state the wrappers a fragment leaves to the browser', () => {
    const source = '<style>p { margin: 0 }</style><p>x</p><p>y</p>'

    expect(extractElement(source, 4)).toMatchObject({
      ok: true,
      frame: `<html>
  <head><style>p { margin: 0 }</style></head>
  <body><p>x</p></body>
</html>
`,
    })
  })

  it.each([
    ['its data-name', '<p data-name=" Sign up ">x</p>', 'Sign up'],
    ['no name when it states none', '<p>x</p>', null],
  ])('should answer its tag with %s', (_case, body, name) => {
    expect(extractElement(frame(body), BODY_FIRST)).toMatchObject({
      tagName: 'p',
      name,
    })
  })

  it('should keep the viewer script alone for an element holding a model', () => {
    const source = frame(
      '<div><model-viewer src="../assets/a.glb"></model-viewer></div>',
      VIEWER,
    )

    const extracted = extractElement(source, BODY_FIRST + 1)

    expect(extracted.ok && extracted.frame).toContain(`${VIEWER}\n  </head>`)
    expect(extracted.ok && extracted.frame).not.toContain('focus()')
  })

  it('should carry a viewer script the body holds into the head for a model', () => {
    const source = frame(
      `<model-viewer src="../assets/a.glb"></model-viewer>${VIEWER}`,
    )

    const extracted = extractElement(source, BODY_FIRST)

    expect(extracted.ok && extracted.frame).toContain(`${VIEWER}</head>`)
  })

  it('should drop the viewer script for an element holding no model', () => {
    const extracted = extractElement(frame('<p>x</p>', VIEWER), BODY_FIRST + 1)

    expect(extracted.ok && extracted.frame).not.toContain('<script')
  })

  it.each([
    ['a table row', '<table><tbody><tr><td>x</td></tr></tbody></table>', 9],
    ['a table cell', '<table><tbody><tr><td>x</td></tr></tbody></table>', 10],
  ])('should refuse %s, which no body holds alone', (_case, body, index) => {
    expect(extractElement(frame(body), index)).toMatchObject({
      ok: false,
      reason: 'invalid-container',
    })
  })

  it('should refuse a shape inside an svg, as a delete does', () => {
    const source = frame('<svg><path d="M0 0"></path></svg>')

    expect(extractElement(source, BODY_FIRST + 1)).toMatchObject({
      ok: false,
      reason: 'verify-failed',
    })
  })

  it('should refuse an index past the last element', () => {
    expect(extractElement(frame('<p>x</p>'), 40)).toMatchObject({
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
