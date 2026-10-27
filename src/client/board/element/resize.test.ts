import { describe, expect, it } from 'vitest'

import { isShape, shapeSize } from './resize'

const BOX = { x: 100, y: 100, width: 200, height: 100 }

describe('shapeSize', () => {
  it('grows from the south-east corner by the drag', () => {
    expect(shapeSize(BOX, 'se', 40, 20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('grows from the north-west corner as the drag moves away from it', () => {
    expect(shapeSize(BOX, 'nw', -40, -20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('clamps at 1 px past the opposite corner rather than flipping', () => {
    expect(shapeSize(BOX, 'se', -500, -500, false)).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('keeps the starting ratio by the side that moved further', () => {
    expect(shapeSize(BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('drops the ratio for a shape drawn with a side at 0 px', () => {
    expect(
      shapeSize({ x: 0, y: 0, width: 200, height: 0 }, 'se', 20, 30, true),
    ).toEqual({ width: 220, height: 30 })
  })

  it('keeps the ratio at no less than 1 px a side', () => {
    expect(shapeSize(BOX, 'se', -500, -500, true)).toEqual({
      width: 2,
      height: 1,
    })
  })
})

describe('isShape', () => {
  const parse = (markup: string) => {
    const host = document.createElement('div')
    host.innerHTML = markup
    return host.firstElementChild
  }

  it('reads a placed rectangle as a shape', () => {
    expect(isShape(parse('<div data-name="Rectangle"></div>'))).toBe(true)
  })

  it.each([
    ['text', '<p>Text</p>'],
    ['a divider', '<hr>'],
    ['a box holding text', '<div>Hi</div>'],
    ['a box holding an element', '<div><span></span></div>'],
  ])('reads %s as no shape', (_name, markup) => {
    expect(isShape(parse(markup))).toBe(false)
  })
})
