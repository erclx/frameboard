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
      ).toEqual({
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
      ).toEqual({ ok: true, html: '<p style="opacity: 0.5">x</p>' })
    })

    it('should remove the style attribute once its last declaration drops', () => {
      expect(
        applyEdit('<p id=a style="color: red">x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: '',
        }),
      ).toEqual({ ok: true, html: '<p id=a>x</p>' })
    })

    it("should keep an entity's semicolon when appending after it", () => {
      expect(
        applyEdit('<p style="font-family: &quot;A&quot;">x</p>', FIRST, {
          kind: 'style',
          property: 'color',
          value: 'blue',
        }),
      ).toEqual({
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
      ).toEqual({
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
      ).toEqual({ ok: true, html: '<p style="" style="color: red">x</p>' })
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

  describe('attribute', () => {
    it('should set an attribute and escape its value', () => {
      expect(
        applyEdit('<p title="old">x</p>', FIRST, {
          kind: 'attribute',
          name: 'title',
          value: 'a "q" & b',
        }),
      ).toEqual({ ok: true, html: '<p title="a &quot;q&quot; &amp; b">x</p>' })
    })

    it('should not close a circle whose solidus ends an unquoted value', () => {
      const source = '<svg><circle id id=x/><path d="M0 0"></path></svg>'
      expect(
        applyEdit(
          source,
          { index: 4 },
          { kind: 'attribute', name: 'class', value: 'c' },
        ),
      ).toEqual({
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
      ).toEqual({ ok: true, html: '<svg viewBox="0 0 2 2"></svg>' })
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
      ).toEqual({ ok: true, html: '<svg><use xlink:href="#b"></use></svg>' })
    })

    it('should add an absent SVG attribute parse5 adjusts the case of', () => {
      expect(
        applyEdit('<svg></svg>', FIRST, {
          kind: 'attribute',
          name: 'viewBox',
          value: '0 0 1 1',
        }),
      ).toEqual({ ok: true, html: '<svg viewbox="0 0 1 1"></svg>' })
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
      ).toEqual({ ok: true, html: '<h1>Ship &lt;it&gt;</h1>' })
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
      ).toEqual({ ok: true, html: source.replace('<p>', '<p id="a">') })
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
