import { describe, expect, it } from 'vitest'

import { isCustomProperty, keepEdits, parseBinds } from './bindings'

describe('parseBinds', () => {
  it('reads a selector and the property after it', () => {
    expect(parseBinds('#photo --brightness')).toEqual({
      selector: '#photo',
      property: '--brightness',
    })
  })

  it('keeps the spaces of a selector naming a descendant', () => {
    expect(parseBinds('  .card  img --blur ')).toEqual({
      selector: '.card img',
      property: '--blur',
    })
  })

  it('reads one word as naming no target', () => {
    expect(parseBinds('--brightness')).toBeNull()
  })

  it('reads an empty value as naming nothing', () => {
    expect(parseBinds('   ')).toBeNull()
  })
})

describe('isCustomProperty', () => {
  it('takes a property opening with two dashes', () => {
    expect(isCustomProperty('--contrast')).toBe(true)
  })

  it('refuses a plain property', () => {
    expect(isCustomProperty('opacity')).toBe(false)
  })

  it('refuses two dashes naming nothing', () => {
    expect(isCustomProperty('--')).toBe(false)
  })
})

describe('keepEdits', () => {
  it('writes three controls on one target as one styles change', () => {
    const edits = keepEdits([
      {
        index: 8,
        value: '130',
        unit: '%',
        target: 6,
        property: '--brightness',
      },
      { index: 10, value: '150', unit: '%', target: 6, property: '--contrast' },
      { index: 12, value: '60', unit: '%', target: 6, property: '--grayscale' },
    ])

    expect(edits).toEqual([
      { index: 8, change: { kind: 'attribute', name: 'value', value: '130' } },
      { index: 10, change: { kind: 'attribute', name: 'value', value: '150' } },
      { index: 12, change: { kind: 'attribute', name: 'value', value: '60' } },
      {
        index: 6,
        change: {
          kind: 'styles',
          declarations: [
            { property: '--brightness', value: '130%' },
            { property: '--contrast', value: '150%' },
            { property: '--grayscale', value: '60%' },
          ],
        },
      },
    ])
  })

  it('gives each target its own styles change', () => {
    const edits = keepEdits([
      { index: 8, value: '4', unit: 'px', target: 3, property: '--blur' },
      { index: 9, value: '0.5', unit: '', target: 5, property: '--fade' },
    ])

    expect(edits.slice(2)).toEqual([
      {
        index: 3,
        change: {
          kind: 'styles',
          declarations: [{ property: '--blur', value: '4px' }],
        },
      },
      {
        index: 5,
        change: {
          kind: 'styles',
          declarations: [{ property: '--fade', value: '0.5' }],
        },
      },
    ])
  })

  it('keeps the later of two controls setting one property', () => {
    const edits = keepEdits([
      { index: 8, value: '20', unit: '%', target: 6, property: '--grayscale' },
      { index: 9, value: '70', unit: '%', target: 6, property: '--grayscale' },
    ])

    expect(edits[2]).toEqual({
      index: 6,
      change: {
        kind: 'styles',
        declarations: [{ property: '--grayscale', value: '70%' }],
      },
    })
  })

  it('writes nothing when no control moved', () => {
    expect(keepEdits([])).toEqual([])
  })
})
