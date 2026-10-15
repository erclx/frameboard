import { describe, expect, it } from 'vitest'

import {
  isReservedPageName,
  isValidName,
  namesCollide,
  nextFreeName,
} from './names'

describe('isValidName', () => {
  it.each(['hero', 'Hero', 'page-1', 'v2.final', 'a_b', '0', 'a'.repeat(64)])(
    'accepts %j',
    (name) => {
      expect(isValidName(name)).toBe(true)
    },
  )

  it.each(['', '-hero', '.hidden', '_x', 'two words', 'a/b', 'a'.repeat(65)])(
    'rejects %j',
    (name) => {
      expect(isValidName(name)).toBe(false)
    },
  )
})

describe('isReservedPageName', () => {
  it('reserves assets in any case', () => {
    expect(isReservedPageName('Assets')).toBe(true)
  })

  it('leaves other names free', () => {
    expect(isReservedPageName('assets-2')).toBe(false)
  })
})

describe('namesCollide', () => {
  it('matches case-insensitively', () => {
    expect(namesCollide('Hero', 'hero')).toBe(true)
  })
})

describe('nextFreeName', () => {
  it('returns the base when free', () => {
    expect(nextFreeName('hero', ['about'])).toBe('hero')
  })

  it('takes the first free suffix', () => {
    expect(nextFreeName('hero', ['hero', 'hero-2'])).toBe('hero-3')
  })

  it('counts a name differing only in case as taken', () => {
    expect(nextFreeName('hero', ['Hero'])).toBe('hero-2')
  })
})
