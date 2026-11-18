import { describe, expect, it } from 'vitest'

import { formatClock, formatElapsed } from './timer'

describe('the elapsed time', () => {
  it('reads minutes and seconds under an hour', () => {
    expect(formatElapsed(252_000)).toBe('04:12')
  })

  it('drops a part second', () => {
    expect(formatElapsed(59_999)).toBe('00:59')
  })

  it('adds hours from the first hour', () => {
    expect(formatElapsed(3_600_000 + 65_000)).toBe('1:01:05')
  })

  it('reads zero for a start ahead of the clock', () => {
    expect(formatElapsed(-4_000)).toBe('00:00')
  })
})

describe('the clock', () => {
  it('reads hours and minutes in the locale given', () => {
    expect(
      formatClock(new Date(2026, 10, 18, 10, 41, 30).getTime(), 'en-GB'),
    ).toBe('10:41')
  })
})
