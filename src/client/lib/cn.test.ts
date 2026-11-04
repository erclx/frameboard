import { describe, expect, it } from 'vitest'

import sheet from '../styles.css?raw'
import { cn } from './cn'

const STEPS = [...sheet.matchAll(/--text-([a-z]+):/g)].map((match) => match[1])

describe('cn', () => {
  it('should read the size steps out of the stylesheet', () => {
    expect(STEPS).toEqual(expect.arrayContaining(['title', 'caption']))
  })

  describe.each(STEPS)('text-%s', (step) => {
    const size = `text-${step}`

    it('should keep the step when a color follows it', () => {
      expect(cn(size, 'text-muted-foreground')).toBe(
        `${size} text-muted-foreground`,
      )
    })

    it('should keep the color when the step follows it', () => {
      expect(cn('text-muted-foreground', size)).toBe(
        `text-muted-foreground ${size}`,
      )
    })

    it('should replace a kit size that comes before it', () => {
      expect(cn('text-sm', size)).toBe(size)
    })

    it('should give way to a kit size that comes after it', () => {
      expect(cn(size, 'text-sm')).toBe('text-sm')
    })

    it('should keep an alignment and a wrap beside it', () => {
      expect(cn('text-center', size, 'text-balance')).toBe(
        `text-center ${size} text-balance`,
      )
    })
  })

  it('should let a later step replace an earlier one', () => {
    expect(cn('text-label', 'text-caption')).toBe('text-caption')
  })
})
