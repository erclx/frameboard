import { describe, expect, it } from 'vitest'

import { parseFontFamilies, requestedFamily } from './fonts'

const DEFAULT = '"Times New Roman"'

describe('parseFontFamilies', () => {
  it('splits a stack and unquotes each family', () => {
    expect(parseFontFamilies('"Brand Sans", Inter, sans-serif')).toEqual([
      'Brand Sans',
      'Inter',
      'sans-serif',
    ])
  })

  it('keeps a comma inside a quoted family', () => {
    expect(parseFontFamilies("'Odd, Name', serif")).toEqual([
      'Odd, Name',
      'serif',
    ])
  })

  it('reads an empty value as no families', () => {
    expect(parseFontFamilies('')).toEqual([])
  })
})

describe('requestedFamily', () => {
  it('takes the first family of the stack', () => {
    expect(requestedFamily('Brand, Geist, sans-serif', DEFAULT)).toBe('Brand')
  })

  it('asks for nothing when the stack opens with a generic', () => {
    expect(requestedFamily('sans-serif, Brand', DEFAULT)).toBeNull()
  })

  it('reads the system aliases as generic in any case', () => {
    expect(
      requestedFamily('-apple-system, "Segoe UI", sans-serif', DEFAULT),
    ).toBeNull()
    expect(requestedFamily('blinkMacSystemFont, Roboto', DEFAULT)).toBeNull()
  })

  it('reads the ui- families as generic', () => {
    expect(requestedFamily('ui-monospace, Menlo', DEFAULT)).toBeNull()
  })

  it('asks for nothing from an empty value', () => {
    expect(requestedFamily('', DEFAULT)).toBeNull()
  })

  it('asks for nothing when the stack opens with the browser default', () => {
    expect(requestedFamily('"Times New Roman"', DEFAULT)).toBeNull()
    expect(requestedFamily('"Times New Roman", Brand', DEFAULT)).toBeNull()
  })

  it('reads the default in any case', () => {
    expect(requestedFamily('times new roman', DEFAULT)).toBeNull()
  })

  it('still asks for a named family when only a later one is the default', () => {
    expect(requestedFamily('Brand, "Times New Roman"', DEFAULT)).toBe('Brand')
  })

  it('asks for the family when the browser default is unknown', () => {
    expect(requestedFamily('"Times New Roman"', '')).toBe('Times New Roman')
  })
})
