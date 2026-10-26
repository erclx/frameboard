import { Circle, Image, Minus, Type } from 'lucide-react'
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
    round: false,
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
    ['an hr as a divider', element({ tag: 'hr' }), Minus],
    ['a round box as an ellipse', element({ round: true }), Circle],
    [
      'a round box laid out as a row still as an ellipse',
      element({ round: true, layout: 'row' }),
      Circle,
    ],
    ['a plain block', element({}), BlockGlyph],
  ])('draws %s', (_case, row, expected) => {
    expect(elementGlyph(row)).toBe(expected)
  })
})
