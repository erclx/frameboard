import { describe, expect, it } from 'vitest'

import type { Box } from '../geometry/box'
import {
  arrangeMembers,
  groupBounds,
  groupBox,
  type GroupMember,
  moveMembers,
  scaleMembers,
  scalesAsGroup,
} from './group'

const BOX = { kind: 'box', inset: { width: 0, height: 0 } } as const

function member(overrides: Partial<GroupMember> & { index: number }) {
  return {
    box: { x: 0, y: 0, width: 10, height: 10 },
    placed: { left: 0, top: 0 },
    read: BOX,
    ...overrides,
  }
}

describe('groupBounds', () => {
  it('wraps every member box', () => {
    const members = [
      member({ index: 1, box: { x: 10, y: 20, width: 30, height: 40 } }),
      member({ index: 2, box: { x: 100, y: 5, width: 20, height: 20 } }),
    ]

    expect(groupBounds(members)).toEqual({
      x: 10,
      y: 5,
      width: 110,
      height: 55,
    })
  })
})

describe('moveMembers', () => {
  it('shifts every free member by the same whole pixels', () => {
    const members = [
      member({ index: 1, placed: { left: 97, top: 150 } }),
      member({ index: 2, placed: { left: 241.81, top: 25.55 } }),
    ]

    expect(moveMembers(members, 62.4, -51.2)).toEqual([
      {
        index: 1,
        declarations: [
          { property: 'left', value: '159px' },
          { property: 'top', value: '99px' },
        ],
      },
      {
        index: 2,
        declarations: [
          { property: 'left', value: '303.81px' },
          { property: 'top', value: '-25.45px' },
        ],
      },
    ])
  })

  it('writes nothing on a member in the flow', () => {
    const members = [
      member({ index: 1, placed: { left: 0, top: 0 } }),
      member({ index: 2, placed: null }),
    ]

    expect(moveMembers(members, 5, 5).map(({ index }) => index)).toEqual([1])
  })
})

describe('groupBox', () => {
  const bounds = { x: 100, y: 100, width: 200, height: 100 }

  it('pins the corner opposite the one dragged', () => {
    expect(groupBox(bounds, 'nw', -20, -10, false)).toEqual({
      x: 80,
      y: 90,
      width: 220,
      height: 110,
    })
  })

  it('keeps the group shape with Shift held', () => {
    expect(groupBox(bounds, 'se', 200, 0, true)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 200,
    })
  })

  it('anchors a kept shape at the far corner when the near one is dragged', () => {
    expect(groupBox(bounds, 'nw', -200, 0, true)).toEqual({
      x: -100,
      y: 0,
      width: 400,
      height: 200,
    })
  })
})

describe('scalesAsGroup', () => {
  it.each([
    [
      'every member free and resizable',
      [member({ index: 1 }), member({ index: 2 })],
      true,
    ],
    [
      'one member in the flow',
      [member({ index: 1 }), member({ index: 2, placed: null })],
      false,
    ],
    [
      'one member sized by what it holds',
      [member({ index: 1 }), member({ index: 2, read: null })],
      false,
    ],
    ['a single member', [member({ index: 1 })], false],
  ])('answers for %s', (_case, members, expected) => {
    expect(scalesAsGroup(members)).toBe(expected)
  })
})

describe('scaleMembers', () => {
  it('keeps each member in proportion to the group when doubled', () => {
    const members = [
      member({
        index: 1,
        box: { x: 100, y: 100, width: 50, height: 50 },
        placed: { left: 20, top: 30 },
      }),
      member({
        index: 2,
        box: { x: 200, y: 150, width: 100, height: 50 },
        placed: { left: 120, top: 80 },
      }),
    ]
    const from = { x: 100, y: 100, width: 200, height: 100 }
    const to = { x: 100, y: 100, width: 400, height: 200 }

    expect(scaleMembers(members, from, to)).toEqual([
      {
        index: 1,
        declarations: [
          { property: 'left', value: '20px' },
          { property: 'top', value: '30px' },
          { property: 'width', value: '100px' },
          { property: 'height', value: '100px' },
        ],
      },
      {
        index: 2,
        declarations: [
          { property: 'left', value: '220px' },
          { property: 'top', value: '130px' },
          { property: 'width', value: '200px' },
          { property: 'height', value: '100px' },
        ],
      },
    ])
  })

  it('writes text its width alone and no font size', () => {
    const members = [
      member({ index: 1, box: { x: 0, y: 0, width: 50, height: 20 } }),
      member({
        index: 2,
        box: { x: 50, y: 0, width: 50, height: 20 },
        placed: { left: 50, top: 0 },
        read: { kind: 'text', inset: { width: 0, height: 0 } },
      }),
    ]
    const from = { x: 0, y: 0, width: 100, height: 20 }
    const to = { x: 0, y: 0, width: 200, height: 40 }

    const [, text] = scaleMembers(members, from, to)

    expect(text?.declarations.map(({ property }) => property)).toEqual([
      'left',
      'top',
      'width',
    ])
  })

  it('writes nothing while a member is in the flow', () => {
    const members = [member({ index: 1 }), member({ index: 2, placed: null })]
    const box = { x: 0, y: 0, width: 10, height: 10 }

    expect(scaleMembers(members, box, { ...box, width: 20 })).toEqual([])
  })
})

describe('arrangeMembers', () => {
  const toLeft = (boxes: Record<string, Box>) =>
    Object.fromEntries(
      Object.entries(boxes).map(([key, box]) => [key, { ...box, x: 0 }]),
    )

  it('moves each member offsets by as far as its box moved', () => {
    const members = [
      member({
        index: 1,
        box: { x: 0, y: 0, width: 10, height: 10 },
        placed: { left: 5, top: 5 },
      }),
      member({
        index: 2,
        box: { x: 40, y: 30, width: 10, height: 10 },
        placed: { left: 45, top: 35 },
      }),
    ]

    expect(arrangeMembers(members, toLeft)).toEqual([
      {
        index: 2,
        declarations: [
          { property: 'left', value: '5px' },
          { property: 'top', value: '35px' },
        ],
      },
    ])
  })

  it('writes nothing while a member sits in the flow', () => {
    const members = [
      member({ index: 1 }),
      member({
        index: 2,
        box: { x: 40, y: 0, width: 10, height: 10 },
        placed: null,
      }),
    ]

    expect(arrangeMembers(members, toLeft)).toEqual([])
  })
})
