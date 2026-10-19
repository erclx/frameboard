import { describe, expect, it } from 'vitest'

import { parseFontFamilies, requestedFamily } from './fonts'

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
    expect(requestedFamily('Brand, Geist, sans-serif')).toBe('Brand')
  })

  it('asks for nothing when the stack opens with a generic', () => {
    expect(requestedFamily('sans-serif, Brand')).toBeNull()
  })

  it('reads the system aliases as generic in any case', () => {
    expect(requestedFamily('-apple-system, "Segoe UI", sans-serif')).toBeNull()
    expect(requestedFamily('blinkMacSystemFont, Roboto')).toBeNull()
  })

  it('reads the ui- families as generic', () => {
    expect(requestedFamily('ui-monospace, Menlo')).toBeNull()
  })

  it('asks for nothing from an empty value', () => {
    expect(requestedFamily('')).toBeNull()
  })
})
