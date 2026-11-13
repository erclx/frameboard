import { describe, expect, it } from 'vitest'

import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { readingOrder } from './order'

function at(
  name: string,
  x: number,
  y: number,
  width = 390,
  height = 844,
): FrameRecord {
  return frameOf(name, { box: { x, y, width, height } })
}

const names = (frames: readonly FrameRecord[]) =>
  frames.map((frame) => frame.name)

describe('readingOrder', () => {
  it('reads a grid row by row, left to right', () => {
    const order = readingOrder([
      at('six', 1000, 1000),
      at('two', 500, 0),
      at('four', 0, 1000),
      at('one', 0, 0),
      at('five', 500, 1000),
      at('three', 1000, 0),
    ])

    expect(names(order)).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
  })

  it('keeps a ragged row whose tops sit a few pixels apart together', () => {
    const order = readingOrder([
      at('right', 1000, 0),
      at('middle', 500, 12),
      at('left', 0, 5),
    ])

    expect(names(order)).toEqual(['left', 'middle', 'right'])
  })

  it('joins a short frame below a tall one while its top is above the tall middle', () => {
    const order = readingOrder([
      at('lower', 500, 300, 390, 264),
      at('upper', 500, 0, 390, 264),
      at('tall', 0, 0, 390, 844),
    ])

    expect(names(order)).toEqual(['tall', 'upper', 'lower'])
  })

  it('starts a new row at a top past the first frame’s middle', () => {
    const order = readingOrder([
      at('below', 0, 422, 390, 264),
      at('beside', 500, 0, 390, 844),
    ])

    expect(names(order)).toEqual(['beside', 'below'])
  })

  it('breaks a tie at one position by stack order, top of the stack first', () => {
    const order = readingOrder([at('under', 0, 0), at('over', 0, 0)])

    expect(names(order)).toEqual(['over', 'under'])
  })

  it('keeps hidden frames in place', () => {
    const order = readingOrder([
      frameOf('hidden', {
        box: { x: 500, y: 0, width: 390, height: 844 },
        hidden: true,
      }),
      at('first', 0, 0),
    ])

    expect(names(order)).toEqual(['first', 'hidden'])
  })
})
