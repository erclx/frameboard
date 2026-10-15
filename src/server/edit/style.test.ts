import { describe, expect, it } from 'vitest'

import { declaredValues, setDeclaration } from './style'

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

  it('should leave the shorthand alone on a longhand write', () => {
    expect(
      setDeclaration('border-radius: 4px', 'border-top-left-radius', '0'),
    ).toEqual({
      ok: true,
      style: 'border-radius: 4px; border-top-left-radius: 0',
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
