import { Image, Type } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import type { TreeElement } from '@/shared/records/elements'

import {
  BlockGlyph,
  elementGlyph,
  GridGlyph,
  LayoutColumnGlyph,
  LayoutRowGlyph,
} from './layer-glyphs'

function element(overrides: Partial<TreeElement>): TreeElement {
  return {
    index: 3,
    parent: null,
    tag: 'div',
    name: 'div',
    textOnly: false,
    layout: 'block',
    ...overrides,
  }
}

describe('elementGlyph', () => {
  it.each([
    ['text alone', element({ tag: 'p', textOnly: true }), Type],
    [
      'text alone in a flex',
      element({ tag: 'span', textOnly: true, layout: 'row' }),
      Type,
    ],
    ['an img', element({ tag: 'img' }), Image],
    ['a video', element({ tag: 'video' }), Image],
    ['a row flex', element({ layout: 'row' }), LayoutRowGlyph],
    ['a column flex', element({ layout: 'column' }), LayoutColumnGlyph],
    ['a grid', element({ layout: 'grid' }), GridGlyph],
    ['a plain block', element({}), BlockGlyph],
  ])('draws %s', (_case, row, expected) => {
    expect(elementGlyph(row)).toBe(expected)
  })
})
