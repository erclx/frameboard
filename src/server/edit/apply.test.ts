import { describe, expect, it } from 'vitest'

import { applyEdit } from './apply'

// Index 3 is the first stated element in a bare fragment, after the implied
// html, head, and body.
const FIRST = { index: 3 }

describe('applyEdit', () => {
  describe('style', () => {
    it('should set one declaration and leave every other byte', () => {
      const source = '<div>\n  <p  id=a\n style="color: red">x</p>\n</div>'
      expect(
        applyEdit(
          source,
          { index: 4 },
          { kind: 'style', property: 'Color', value: 'blue' },
        ),
      ).toMatchObject({
        ok: true,
        html: '<div>\n  <p  id=a\n style="color: blue">x</p>\n</div>',
      })
    })

    it('should add a style attribute the element lacks', () => {
      expect(
        applyEdit('<p>x</p>', FIRST, {
          kind: 'style',
          property: 'opacity',
          value: '0.5',
        }),
      ).toMatchObject({ ok: true, html: '<p style="opacity: 0.5">x</p>' })
    })

    it('should remove the style attribute once its last declaration drops', () => {
      expect(
        applyEdit('<p id=a style="color: red">x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: '',
        }),
      ).toMatchObject({ ok: true, html: '<p id=a>x</p>' })
    })

    it.each([
      [
        'border-width',
        '4px',
        '<h1 style="border: 4px solid var(--border)">x</h1>',
      ],
      [
        'border-color',
        '#1e40af',
        '<h1 style="border: 1px solid #1e40af">x</h1>',
      ],
    ])(
      "should write %s into the border shorthand's part",
      (property, value, html) => {
        expect(
          applyEdit(
            '<h1 style="border: 1px solid var(--border)">x</h1>',
            FIRST,
            { kind: 'style', property, value },
          ),
        ).toMatchObject({ ok: true, html })
      },
    )

    it.each([
      [
        'border: 1px solid red; border-top-width: 3px',
        'border-width',
        '2px',
        'border: 1px solid red; border-top-width: 3px; border-width: 2px',
      ],
      [
        'border: 1px solid red; border-top: 3px solid red',
        'border-width',
        '2px',
        'border: 1px solid red; border-top: 3px solid red; border-width: 2px',
      ],
      [
        'border: 1px solid red; border-left-color: blue',
        'border-color',
        '#000',
        'border: 1px solid red; border-left-color: blue; border-color: #000',
      ],
    ])(
      'should state the longhand after a later side over %s',
      (style, property, value, written) => {
        expect(
          applyEdit(`<h1 style="${style}">x</h1>`, FIRST, {
            kind: 'style',
            property,
            value,
          }),
        ).toMatchObject({ ok: true, html: `<h1 style="${written}">x</h1>` })
      },
    )

    it('should drop a longhand the shorthand after it already overrode', () => {
      expect(
        applyEdit(
          '<h1 style="border-color: red; border: 1px solid blue">x</h1>',
          FIRST,
          { kind: 'style', property: 'border-color', value: '#000' },
        ),
      ).toMatchObject({
        ok: true,
        html: '<h1 style="border: 1px solid #000">x</h1>',
      })
    })

    it("should write a background color into the background shorthand's part", () => {
      expect(
        applyEdit('<div style="background: var(--muted)">x</div>', FIRST, {
          kind: 'style',
          property: 'background-color',
          value: '#1e40af',
        }),
      ).toMatchObject({
        ok: true,
        html: '<div style="background: #1e40af">x</div>',
      })
    })

    it("should keep an entity's semicolon when appending after it", () => {
      expect(
        applyEdit('<p style="font-family: &quot;A&quot;">x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: 'blue',
        }),
      ).toMatchObject({
        ok: true,
        html: '<p style="font-family: &quot;A&quot;; color: blue">x</p>',
      })
    })

    it('should escape a quote in the value', () => {
      expect(
        applyEdit('<p>x</p>', FIRST, {
          kind: 'style',
          property: 'font-family',
          value: '"Geist", serif',
        }),
      ).toMatchObject({
        ok: true,
        html: '<p style="font-family: &quot;Geist&quot;, serif">x</p>',
      })
    })

    it('should empty the first of two style attributes rather than promote the second', () => {
      expect(
        applyEdit('<p style="color: blue" style="color: red">x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: '',
        }),
      ).toMatchObject({
        ok: true,
        html: '<p style="" style="color: red">x</p>',
      })
    })

    it('should refuse a style ending inside an open quote', () => {
      expect(
        applyEdit(`<p style="content: 'a">x</p>`, FIRST, {
          kind: 'style',
          property: 'color',
          value: 'red',
        }),
      ).toMatchObject({ ok: false, reason: 'open-quote' })
    })

    it.each(['red; color: blue', 'a{b}', 'x\ny', 'a<b'])(
      'should refuse the value %j, which would start another declaration',
      (value) => {
        expect(
          applyEdit('<p>x</p>', FIRST, {
            kind: 'style',
            property: 'color',
            value,
          }),
        ).toMatchObject({ ok: false, reason: 'invalid-edit' })
      },
    )

    it('should refuse a value past 200 characters', () => {
      expect(
        applyEdit('<p>x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: 'a'.repeat(201),
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })

    it('should refuse a property that is not a CSS name', () => {
      expect(
        applyEdit('<p>x</p>', FIRST, {
          kind: 'style',
          property: 'color:red',
          value: 'x',
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })
  })

  describe('styles', () => {
    const SHAPE =
      '<div data-name="Ellipse" style="width: 100px; height: 100px; border-radius: 50%"></div>'

    it('should set every declaration and record one start tag span', () => {
      const result = applyEdit(SHAPE, FIRST, {
        kind: 'styles',
        declarations: [
          { property: 'Width', value: '240px' },
          { property: 'height', value: '120px' },
        ],
      })

      expect(result).toEqual({
        ok: true,
        html: '<div data-name="Ellipse" style="width: 240px; height: 120px; border-radius: 50%"></div>',
        span: {
          scope: 'start-tag',
          index: 3,
          count: 4,
          before:
            '<div data-name="Ellipse" style="width: 100px; height: 100px; border-radius: 50%">',
          after:
            '<div data-name="Ellipse" style="width: 240px; height: 120px; border-radius: 50%">',
        },
      })
    })

    it('should add the declarations an element lacks', () => {
      expect(
        applyEdit('<div style="width: 50%"></div>', FIRST, {
          kind: 'styles',
          declarations: [
            { property: 'width', value: '300px' },
            { property: 'height', value: '80px' },
          ],
        }),
      ).toMatchObject({
        ok: true,
        html: '<div style="width: 300px; height: 80px"></div>',
      })
    })

    it('should fold a padding pair over its shorthand and verify the fold', () => {
      expect(
        applyEdit('<div style="padding: 8px 16px"></div>', FIRST, {
          kind: 'styles',
          declarations: [
            { property: 'padding-top', value: '16px' },
            { property: 'padding-bottom', value: '16px' },
          ],
        }),
      ).toMatchObject({
        ok: true,
        html: '<div style="padding: 16px"></div>',
      })
    })

    it('should write a padding pair alone where no other side is inline', () => {
      expect(
        applyEdit('<div style="color: red"></div>', FIRST, {
          kind: 'styles',
          declarations: [
            { property: 'padding-left', value: '24px' },
            { property: 'padding-right', value: '24px' },
          ],
        }),
      ).toMatchObject({
        ok: true,
        html: '<div style="color: red; padding-left: 24px; padding-right: 24px"></div>',
      })
    })

    it('should refuse no declarations', () => {
      expect(
        applyEdit(SHAPE, FIRST, { kind: 'styles', declarations: [] }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })

    it('should refuse one property named twice', () => {
      expect(
        applyEdit(SHAPE, FIRST, {
          kind: 'styles',
          declarations: [
            { property: 'width', value: '1px' },
            { property: 'WIDTH', value: '2px' },
          ],
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })

    it('should refuse the whole change when one declaration breaks out', () => {
      expect(
        applyEdit(SHAPE, FIRST, {
          kind: 'styles',
          declarations: [
            { property: 'width', value: '240px' },
            { property: 'height', value: '1px; color: red' },
          ],
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })
  })

  describe('attribute', () => {
    it('should set an attribute and escape its value', () => {
      expect(
        applyEdit('<p title="old">x</p>', FIRST, {
          kind: 'attribute',
          name: 'title',
          value: 'a "q" & b',
        }),
      ).toMatchObject({
        ok: true,
        html: '<p title="a &quot;q&quot; &amp; b">x</p>',
      })
    })

    it('should not close a circle whose solidus ends an unquoted value', () => {
      const source = '<svg><circle id id=x/><path d="M0 0"></path></svg>'
      expect(
        applyEdit(
          source,
          { index: 4 },
          { kind: 'attribute', name: 'class', value: 'c' },
        ),
      ).toMatchObject({
        ok: true,
        html: '<svg><circle id id=x/ class="c"><path d="M0 0"></path></svg>',
      })
    })

    it('should set an SVG attribute parse5 adjusts the case of', () => {
      expect(
        applyEdit('<svg viewBox="0 0 1 1"></svg>', FIRST, {
          kind: 'attribute',
          name: 'viewBox',
          value: '0 0 2 2',
        }),
      ).toMatchObject({ ok: true, html: '<svg viewBox="0 0 2 2"></svg>' })
    })

    it('should set a namespaced SVG attribute', () => {
      expect(
        applyEdit(
          '<svg><use xlink:href="#a"></use></svg>',
          { index: 4 },
          {
            kind: 'attribute',
            name: 'xlink:href',
            value: '#b',
          },
        ),
      ).toMatchObject({
        ok: true,
        html: '<svg><use xlink:href="#b"></use></svg>',
      })
    })

    it('should add an absent SVG attribute parse5 adjusts the case of', () => {
      expect(
        applyEdit('<svg></svg>', FIRST, {
          kind: 'attribute',
          name: 'viewBox',
          value: '0 0 1 1',
        }),
      ).toMatchObject({ ok: true, html: '<svg viewbox="0 0 1 1"></svg>' })
    })

    it('should refuse style, which takes a style edit', () => {
      expect(
        applyEdit('<p>x</p>', FIRST, {
          kind: 'attribute',
          name: 'Style',
          value: 'a',
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })

    it('should drop a boolean attribute and leave every other byte', () => {
      const source =
        '<video  src="a.webm" autoplay\n  muted loop playsinline></video>'
      expect(
        applyEdit(source, FIRST, {
          kind: 'attribute',
          name: 'Muted',
          remove: true,
        }),
      ).toMatchObject({
        ok: true,
        html: '<video  src="a.webm" autoplay loop playsinline></video>',
      })
    })

    it('should leave the source as it was when the dropped attribute is absent', () => {
      const source = '<video src="a.webm" loop></video>'
      expect(
        applyEdit(source, FIRST, {
          kind: 'attribute',
          name: 'muted',
          remove: true,
        }),
      ).toMatchObject({ ok: true, html: source })
    })

    it.each(['<video muted muted></video>', '<video muted="" muted></video>'])(
      'should refuse dropping from %j, where a duplicate would stay in force',
      (source) => {
        expect(
          applyEdit(source, FIRST, {
            kind: 'attribute',
            name: 'muted',
            remove: true,
          }),
        ).toMatchObject({ ok: false, reason: 'verify-failed' })
      },
    )

    it('should refuse dropping style, which takes a style edit', () => {
      expect(
        applyEdit('<p style="color: red">x</p>', FIRST, {
          kind: 'attribute',
          name: 'style',
          remove: true,
        }),
      ).toMatchObject({ ok: false, reason: 'invalid-edit' })
    })

    it.each(['a b', 'a=b', 'a>', '"a', ''])(
      'should refuse the name %j, which the tokenizer would not read as one',
      (name) => {
        expect(
          applyEdit('<p>x</p>', FIRST, { kind: 'attribute', name, value: 'a' }),
        ).toMatchObject({ ok: false, reason: 'invalid-edit' })
      },
    )
  })

  describe('text', () => {
    it('should replace the text of an element holding text alone', () => {
      expect(
        applyEdit('<h1>Old</h1>', FIRST, { kind: 'text', value: 'Ship <it>' }),
      ).toMatchObject({ ok: true, html: '<h1>Ship &lt;it&gt;</h1>' })
    })

    it('should refuse an element holding another element', () => {
      expect(
        applyEdit('<p>a<b>b</b></p>', FIRST, { kind: 'text', value: 'x' }),
      ).toMatchObject({ ok: false, reason: 'not-text-only' })
    })

    it('should refuse misnesting, where the browser builds a clone the file does not state', () => {
      expect(
        applyEdit('<b>1<p>2</b>3</p>', FIRST, { kind: 'text', value: 'x' }),
      ).toMatchObject({ ok: false, reason: 'address-mismatch' })
    })

    describe('a run', () => {
      const MIXED =
        '<ul><li>Wipes in beside it, <code>wipe</code> same press</li></ul>'
      const LI = { index: 4 }

      it('should write one run beside a child element and keep the child', () => {
        expect(
          applyEdit(MIXED, LI, {
            kind: 'text',
            value: 'Wipes & beside it, ',
            run: 0,
          }),
        ).toMatchObject({
          ok: true,
          html: '<ul><li>Wipes &amp; beside it, <code>wipe</code> same press</li></ul>',
          span: {
            scope: 'element',
            before: '<li>Wipes in beside it, <code>wipe</code> same press</li>',
            after:
              '<li>Wipes &amp; beside it, <code>wipe</code> same press</li>',
          },
        })
      })

      it('should drop a run emptied of text and keep the rest', () => {
        expect(
          applyEdit(MIXED, LI, { kind: 'text', value: '', run: 1 }),
        ).toMatchObject({
          ok: true,
          html: '<ul><li>Wipes in beside it, <code>wipe</code></li></ul>',
        })
      })

      it('should refuse a run past the last text node and write nothing', () => {
        expect(
          applyEdit(MIXED, LI, { kind: 'text', value: 'x', run: 2 }),
        ).toEqual({
          ok: false,
          reason: 'not-text-only',
          detail: '<li> holds no text run 2',
        })
      })

      it.each([-1, 1.5])('should refuse the run %d', (run) => {
        expect(
          applyEdit(MIXED, LI, { kind: 'text', value: 'x', run }),
        ).toMatchObject({ ok: false, reason: 'invalid-edit' })
      })

      it('should refuse a run whose written text the parser reads otherwise', () => {
        // The parser reads a lone carriage return as a line feed.
        expect(
          applyEdit(MIXED, LI, { kind: 'text', value: 'a\rb', run: 0 }),
        ).toMatchObject({ ok: false, reason: 'verify-failed' })
      })
    })

    it('should refuse text into head', () => {
      expect(
        applyEdit(
          '<html><head></head><body></body></html>',
          { index: 1 },
          {
            kind: 'text',
            value: 'x',
          },
        ),
      ).toMatchObject({ ok: false, reason: 'not-text-only' })
    })
  })

  describe('address', () => {
    it('should resolve the index over the tree the browser builds behind a BOM', () => {
      const source =
        '\uFEFF<!doctype html>\n<html><head></head><body><p>x</p></body></html>'
      expect(
        applyEdit(source, FIRST, { kind: 'attribute', name: 'id', value: 'a' }),
      ).toMatchObject({ ok: true, html: source.replace('<p>', '<p id="a">') })
    })

    it('should refuse when the browser builds a tbody the file does not state', () => {
      expect(
        applyEdit('<table><tr><td>a</td></tr></table>', FIRST, {
          kind: 'attribute',
          name: 'id',
          value: 'a',
        }),
      ).toMatchObject({ ok: false, reason: 'address-mismatch' })
    })

    it('should refuse an implied wrapper', () => {
      expect(
        applyEdit(
          '<p>x</p>',
          { index: 0 },
          { kind: 'attribute', name: 'id', value: 'a' },
        ),
      ).toMatchObject({ ok: false, reason: 'address-mismatch' })
    })

    it.each([4, -1, 1.5])(
      'should refuse the index %d, which names no element',
      (index) => {
        expect(
          applyEdit(
            '<p>x</p>',
            { index },
            { kind: 'attribute', name: 'id', value: 'a' },
          ),
        ).toMatchObject({ ok: false, reason: 'invalid-address' })
      },
    )
  })

  describe('verify', () => {
    it('should refuse an edit the reparsed output does not hold', () => {
      // The parser reads a lone carriage return as a line feed.
      expect(
        applyEdit('<p>x</p>', FIRST, { kind: 'text', value: 'a\rb' }),
      ).toMatchObject({ ok: false, reason: 'verify-failed' })
    })
  })
})
