import { describe, expect, it } from 'vitest'

import { declaredValues, setDeclaration, shorthandValue } from './style'

describe('setDeclaration', () => {
  it('should replace a declaration in place and keep the others as written', () => {
    expect(setDeclaration('color:red;  padding:4px', 'color', 'blue')).toEqual({
      ok: true,
      style: 'color: blue;  padding:4px',
    })
  })

  it('should drop a later declaration of the same property', () => {
    expect(setDeclaration('color: red; color: green', 'color', 'blue')).toEqual(
      {
        ok: true,
        style: 'color: blue',
      },
    )
  })

  it('should append a new declaration', () => {
    expect(setDeclaration('color: red;', 'opacity', '0.5')).toEqual({
      ok: true,
      style: 'color: red; opacity: 0.5',
    })
  })

  it("should keep an entity's own semicolon when appending after it", () => {
    expect(
      setDeclaration('font-family: &quot;A&quot;', 'color', 'blue'),
    ).toEqual({ ok: true, style: 'font-family: &quot;A&quot;; color: blue' })
  })

  it('should drop a declaration on an empty value', () => {
    expect(setDeclaration('color: red; padding: 4px', 'color', '')).toEqual({
      ok: true,
      style: 'padding: 4px',
    })
  })

  it('should leave no style once the last declaration drops', () => {
    expect(setDeclaration('color: red;', 'color', ' ')).toEqual({
      ok: true,
      style: '',
    })
  })

  it('should drop the longhands a shorthand write overrides', () => {
    expect(
      setDeclaration(
        'padding-top: 1px; color: red; padding-left: 2px',
        'padding',
        '4px',
      ),
    ).toEqual({ ok: true, style: 'color: red; padding: 4px' })
  })

  it('should drop a border and every border longhand, leaving the radius', () => {
    expect(
      setDeclaration(
        'border: 1px solid var(--border); border-color: red; border-top-width: 2px; border-radius: 4px',
        'border',
        '',
      ),
    ).toEqual({ ok: true, style: 'border-radius: 4px' })
  })

  it('should leave no style once a border and its longhands drop', () => {
    expect(
      setDeclaration('border: 1px solid; border-color: red', 'border', ''),
    ).toEqual({ ok: true, style: '' })
  })

  it('should drop a background and every background longhand', () => {
    expect(
      setDeclaration(
        'background: #fff; color: red; background-color: blue; background-image: none',
        'background',
        '',
      ),
    ).toEqual({ ok: true, style: 'color: red' })
  })

  it('should leave the shorthand alone on a longhand write', () => {
    expect(
      setDeclaration('border-radius: 4px', 'border-top-left-radius', '0'),
    ).toEqual({
      ok: true,
      style: 'border-radius: 4px; border-top-left-radius: 0',
    })
  })

  describe('a paint longhand over its shorthand', () => {
    it("should rewrite a background shorthand's color in place", () => {
      expect(
        setDeclaration(
          'width: 10px; background: var(--muted)',
          'background-color',
          '#1e40af',
        ),
      ).toEqual({ ok: true, style: 'width: 10px; background: #1e40af' })
    })

    it("should rewrite a border shorthand's color in place", () => {
      expect(
        setDeclaration(
          'border: 1px solid var(--primary)',
          'border-color',
          '#1e40af',
        ),
      ).toEqual({ ok: true, style: 'border: 1px solid #1e40af' })
    })

    it("should rewrite a border shorthand's width in place", () => {
      expect(
        setDeclaration(
          'border: 1px solid var(--primary)',
          'border-width',
          '4px',
        ),
      ).toEqual({ ok: true, style: 'border: 4px solid var(--primary)' })
    })

    it('should keep an !important the shorthand carries', () => {
      expect(
        setDeclaration(
          'border: 1px solid var(--primary) !important',
          'border-color',
          '#1e40af',
        ),
      ).toEqual({ ok: true, style: 'border: 1px solid #1e40af !important' })
    })

    it('should keep an !important written against the color', () => {
      expect(
        setDeclaration(
          'border: 1px solid red!important',
          'border-color',
          '#1e40af',
        ),
      ).toEqual({ ok: true, style: 'border: 1px solid #1e40af!important' })
    })

    it('should leave a background image beside the color alone', () => {
      expect(
        setDeclaration(
          'background: url(a.png) var(--muted)',
          'background-color',
          '#1e40af',
        ),
      ).toEqual({ ok: true, style: 'background: url(a.png) #1e40af' })
    })

    it('should append the longhand when the shorthand holds no color', () => {
      expect(
        setDeclaration('border: 2px solid', 'border-color', '#1e40af'),
      ).toEqual({ ok: true, style: 'border: 2px solid; border-color: #1e40af' })
    })

    it('should replace a longhand stated after the shorthand in place', () => {
      expect(
        setDeclaration(
          'background: red; background-color: blue',
          'background-color',
          '#1e40af',
        ),
      ).toEqual({
        ok: true,
        style: 'background: red; background-color: #1e40af',
      })
    })

    it('should keep a color-mix color one part when the width changes', () => {
      expect(
        setDeclaration(
          'border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent)',
          'border-width',
          '2.5px',
        ),
      ).toEqual({
        ok: true,
        style:
          'border: 2.5px solid color-mix(in srgb, var(--primary) 50%, transparent)',
      })
    })

    it('should drop the longhand rather than the shorthand on an empty value', () => {
      expect(
        setDeclaration('border: 1px solid red', 'border-color', ''),
      ).toEqual({ ok: true, style: 'border: 1px solid red' })
    })
  })

  it('should not split inside parentheses or quotes', () => {
    expect(
      setDeclaration("background: url(a;b); content: 'x;y'", 'color', 'red'),
    ).toEqual({
      ok: true,
      style: "background: url(a;b); content: 'x;y'; color: red",
    })
  })

  it('should refuse a style ending inside an open quote', () => {
    expect(setDeclaration("content: 'a", 'color', 'red')).toEqual({ ok: false })
  })

  it('should read a quote a backslash escapes as still open', () => {
    expect(setDeclaration("content: 'a\\'", 'color', 'red')).toEqual({
      ok: false,
    })
  })

  it('should not split inside a string a backslash escape runs through', () => {
    expect(
      setDeclaration("content: 'a\\'; x: 1; y: \\''; x: 2", 'x', '3'),
    ).toEqual({ ok: true, style: "content: 'a\\'; x: 1; y: \\''; x: 3" })
  })

  it('should not split inside a comment', () => {
    expect(
      setDeclaration('color: red /* ; */; margin: 0', 'color', 'blue'),
    ).toEqual({ ok: true, style: 'color: blue; margin: 0' })
  })

  it('should drop a declaration a comment comes ahead of', () => {
    expect(
      setDeclaration('/* a */ color: red; margin: 0', 'color', ''),
    ).toEqual({ ok: true, style: 'margin: 0' })
  })

  it('should replace a declaration a comment comes ahead of', () => {
    expect(setDeclaration('/* a */ color: red', 'color', 'blue')).toEqual({
      ok: true,
      style: 'color: blue',
    })
  })

  it('should refuse a style ending inside an open comment', () => {
    expect(setDeclaration('color: red /* x', 'margin', '0')).toEqual({
      ok: false,
    })
  })

  it('should count an encoded quote as a quote', () => {
    expect(setDeclaration('content: &quot;a', 'color', 'red')).toEqual({
      ok: false,
    })
  })
})

describe('declaredValues', () => {
  it('should read each value a decoded style declares for a property', () => {
    expect(
      declaredValues(
        'Color: red; background: url("a;b"); color: blue',
        'color',
      ),
    ).toEqual(['red', 'blue'])
  })
})

describe('setDeclaration on a padding side', () => {
  it('should fold four agreeing sides into one value', () => {
    expect(
      setDeclaration(
        'padding-top: 4px; padding-right: 8px; padding-bottom: 4px; padding-left: 4px',
        'padding-right',
        '4px',
      ),
    ).toEqual({ ok: true, style: 'padding: 4px' })
  })

  it('should fold a side written over a shorthand into the shorthand', () => {
    expect(
      setDeclaration('color: red; padding: 8px 16px', 'padding-top', '16px'),
    ).toEqual({ ok: true, style: 'color: red; padding: 16px 16px 8px' })
  })

  it.each([
    ['8px 16px', '8px', 'padding: 8px 16px'],
    ['8px 16px 4px', '8px', 'padding: 8px 16px 4px'],
    ['8px 16px 4px 2px', '8px', 'padding: 8px 16px 4px 2px'],
  ])('should write the shortest form of %s', (shorthand, top, folded) => {
    expect(setDeclaration(`padding: ${shorthand}`, 'padding-top', top)).toEqual(
      { ok: true, style: folded },
    )
  })

  it('should leave two sides alone while the other two come from a sheet', () => {
    expect(
      setDeclaration('padding-left: 24px', 'padding-right', '24px'),
    ).toEqual({ ok: true, style: 'padding-left: 24px; padding-right: 24px' })
  })

  it.each([
    ['a shorthand holding var()', 'padding: var(--space)'],
    ['an important side', 'padding: 4px; padding-left: 4px !important'],
    ['a commented side', 'padding: 4px; padding-left: /* x */ 4px'],
    ['a logical side', 'padding: 4px; padding-inline: 2px'],
    [
      'a side the shorthand after it overrides',
      'padding-left: 2px; padding: 4px',
    ],
    ['a value no length reads', 'padding: 4px; padding-left: 1fr'],
    ['a unitless side', 'padding: 4px; padding-left: 2'],
    ['a negative side', 'padding: 4px; padding-left: -2px'],
    ['a number ending on its dot', 'padding: 4px; padding-left: 4.px'],
  ])('should not fold %s', (_, style) => {
    expect(setDeclaration(style, 'padding-top', '8px')).toEqual({
      ok: true,
      style: `${style}; padding-top: 8px`,
    })
  })

  it('should keep a lone shorthand as written when a side drops', () => {
    expect(
      setDeclaration('padding:4px; padding-top: 8px', 'padding-top', ''),
    ).toEqual({ ok: true, style: 'padding:4px' })
  })

  it('should leave the padding as written on an edit to another property', () => {
    expect(
      setDeclaration(
        'padding-top: 4px; padding-right: 4px; padding-bottom: 4px; padding-left: 4px',
        'color',
        'red',
      ),
    ).toEqual({
      ok: true,
      style:
        'padding-top: 4px; padding-right: 4px; padding-bottom: 4px; padding-left: 4px; color: red',
    })
  })
})

describe('shorthandValue', () => {
  it.each([
    ['padding-top', '1px'],
    ['padding-right', '2px'],
    ['padding-bottom', '3px'],
    ['padding-left', '2px'],
  ])('should read %s from a padding shorthand', (property, side) => {
    expect(shorthandValue('padding: 1px 2px 3px', property)).toBe(side)
  })

  it('should read no side from a shorthand holding var()', () => {
    expect(shorthandValue('padding: var(--space)', 'padding-top')).toBe(
      undefined,
    )
  })
})
