import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import { familyIn, familyOptions } from './families'

function fontToken(name: string, stack: string): TokenRow {
  return {
    name,
    group: 'font',
    light: stack,
    dark: stack,
    sheet: 'studio/tokens.css',
    overrides: false,
  }
}

describe('familyOptions', () => {
  it('lists the font tokens, then the served faces, then the installed families', () => {
    const options = familyOptions(
      [fontToken('--font-display', "'Lora', serif")],
      [{ family: 'Lora' }, { family: 'Playfair Display' }],
    )

    expect(options.map((option) => option.name)).toEqual([
      'font-display',
      'Geist',
      'Geist Mono',
      'Inter',
      'Source Serif 4',
      'Caveat',
      'Lora',
      'Playfair Display',
    ])
  })

  it('writes an installed family by its own name, quoted where it holds a space', () => {
    const options = familyOptions([], [{ family: 'Playfair Display' }])

    expect(options.at(-1)).toEqual({
      value: "'Playfair Display'",
      name: 'Playfair Display',
      token: null,
      stack: "'Playfair Display'",
    })
  })

  it('lists an installed family a served face already names once, as the face', () => {
    const options = familyOptions([], [{ family: 'inter' }])

    expect(options.map((option) => option.name)).toEqual([
      'Geist',
      'Geist Mono',
      'Inter',
      'Source Serif 4',
      'Caveat',
    ])
  })
})

describe('familyIn', () => {
  it('shows an element drawn in an installed family as that family', () => {
    const options = familyOptions([], [{ family: 'Playfair Display' }])

    expect(familyIn('"Playfair Display", serif', null, options)?.value).toBe(
      "'Playfair Display'",
    )
  })

  it('shows nothing for a family the menu does not list', () => {
    const options = familyOptions([])

    expect(familyIn('"Playfair Display", serif', null, options)).toBeNull()
  })
})
