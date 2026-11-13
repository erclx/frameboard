import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import { shapePaint } from './shape-paint'

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

describe('shapePaint', () => {
  it('should fill with the first of muted, secondary, and accent present', () => {
    expect(
      shapePaint([token('--accent'), token('--secondary'), token('--muted')])
        .fill,
    ).toBe('var(--muted)')
  })

  it('should fill with the first color token when none of the three is set', () => {
    expect(
      shapePaint([token('--radius', 'radius'), token('--brand')]).fill,
    ).toBe('var(--brand)')
  })

  it('should fill with a raw grey when the project sets no color token', () => {
    expect(shapePaint([token('--radius', 'radius')]).fill).toBe('#d9d9d9')
  })

  it('should draw the line in the border token first', () => {
    expect(shapePaint([token('--brand'), token('--border')]).line).toBe(
      'var(--border)',
    )
  })
})
