import { describe, expect, it } from 'vitest'

import { align, distribute } from './arrange'

const A = { x: 0, y: 0, width: 100, height: 100 }
const B = { x: 300, y: 50, width: 200, height: 50 }

describe('align', () => {
  it.each([
    ['left', { a: 0, b: 0 }],
    ['center', { a: 200, b: 150 }],
    ['right', { a: 400, b: 300 }],
  ] as const)('aligns %s on the selection bounds', (alignment, x) => {
    const aligned = align({ a: A, b: B }, alignment)

    expect([aligned.a?.x, aligned.b?.x]).toEqual([x.a, x.b])
  })

  it.each([
    ['top', { a: 0, b: 0 }],
    ['middle', { a: 0, b: 25 }],
    ['bottom', { a: 0, b: 50 }],
  ] as const)('aligns %s on the selection bounds', (alignment, y) => {
    const aligned = align({ a: A, b: B }, alignment)

    expect([aligned.a?.y, aligned.b?.y]).toEqual([y.a, y.b])
  })

  it('leaves one frame where it is', () => {
    expect(align({ b: B }, 'left')).toEqual({ b: B })
  })

  it('rounds a center that falls on a half pixel', () => {
    const aligned = align({ a: A, c: { ...B, width: 101 } }, 'center')

    expect(aligned.a?.x).toBe(151)
  })
})

describe('distribute', () => {
  it('evens the horizontal gaps and keeps the outer frames', () => {
    const spaced = distribute(
      {
        left: { x: 0, y: 0, width: 100, height: 10 },
        middle: { x: 120, y: 0, width: 100, height: 10 },
        right: { x: 400, y: 0, width: 100, height: 10 },
      },
      'horizontal',
    )

    expect([spaced.left?.x, spaced.middle?.x, spaced.right?.x]).toEqual([
      0, 200, 400,
    ])
  })

  it('evens the vertical gaps whatever order the frames arrive in', () => {
    const spaced = distribute(
      {
        bottom: { x: 0, y: 300, width: 10, height: 100 },
        top: { x: 0, y: 0, width: 10, height: 50 },
        middle: { x: 0, y: 60, width: 10, height: 50 },
      },
      'vertical',
    )

    expect([spaced.top?.y, spaced.middle?.y, spaced.bottom?.y]).toEqual([
      0, 150, 300,
    ])
  })

  it('leaves two frames where they are', () => {
    expect(distribute({ a: A, b: B }, 'horizontal')).toEqual({ a: A, b: B })
  })
})
