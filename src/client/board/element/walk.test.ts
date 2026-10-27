import { describe, expect, it } from 'vitest'

import type { TreeElement } from '@/shared/records/elements'

import { down, sibling, siblingGap, up } from './walk'

function element(
  index: number,
  parent: number | null,
  tag = 'div',
): TreeElement {
  return {
    index,
    parent,
    tag,
    name: tag,
    textOnly: false,
    layout: 'block',
    round: false,
  }
}

// <main 6><h1 7/><p 8/><a 9/></main><footer 10/>
const TREE = [
  element(6, null, 'main'),
  element(7, 6, 'h1'),
  element(8, 6, 'p'),
  element(9, 6, 'a'),
  element(10, null, 'footer'),
]

describe('down', () => {
  it("goes from the frame to body's first child", () => {
    expect(down(TREE, null)).toBe(6)
  })

  it('goes from an element to its first child', () => {
    expect(down(TREE, 6)).toBe(7)
  })

  it('stays at an element with no children', () => {
    expect(down(TREE, 7)).toBeUndefined()
  })

  it('stays at a frame with nothing in its body', () => {
    expect(down([], null)).toBeUndefined()
  })
})

describe('up', () => {
  it('goes from an element to its parent', () => {
    expect(up(TREE, 8)).toBe(6)
  })

  it('goes from a child of body to the frame', () => {
    expect(up(TREE, 6)).toBeNull()
  })

  it('stays for an index the tree does not hold', () => {
    expect(up(TREE, 99)).toBeUndefined()
  })
})

describe('sibling', () => {
  it('steps to the next sibling', () => {
    expect(sibling(TREE, 7, 1)).toBe(8)
  })

  it('wraps from the last sibling to the first', () => {
    expect(sibling(TREE, 9, 1)).toBe(7)
  })

  it('wraps from the first sibling to the last going back', () => {
    expect(sibling(TREE, 7, -1)).toBe(9)
  })

  it("steps among body's children apart from their descendants", () => {
    expect(sibling(TREE, 6, 1)).toBe(10)
  })

  it('stays on an only child', () => {
    expect(sibling([element(6, null), element(7, 6)], 7, 1)).toBe(7)
  })
})

describe('siblingGap', () => {
  it('goes before the previous sibling one place up', () => {
    expect(siblingGap(TREE, 8, (at) => at - 1)).toEqual({
      parent: 6,
      before: 7,
    })
  })

  it("goes to the parent's end from the next-to-last place down", () => {
    expect(siblingGap(TREE, 8, (at) => at + 1)).toEqual({
      parent: 6,
      before: null,
    })
  })

  it('goes before the sibling that holds the place a drop names', () => {
    expect(siblingGap(TREE, 9, () => 0)).toEqual({ parent: 6, before: 7 })
  })

  it("names body by the index just before its first child's", () => {
    expect(siblingGap(TREE, 10, (at) => at - 1)).toEqual({
      parent: 5,
      before: 6,
    })
  })

  it('has nowhere to go above the first child', () => {
    expect(siblingGap(TREE, 7, (at) => at - 1)).toBeUndefined()
  })

  it('has nowhere to go below the last child', () => {
    expect(siblingGap(TREE, 9, (at) => at + 1)).toBeUndefined()
  })

  it('has nowhere to go for the place it already holds', () => {
    expect(siblingGap(TREE, 8, () => 1)).toBeUndefined()
  })

  it('has nowhere to go for an index the tree does not hold', () => {
    expect(siblingGap(TREE, 99, (at) => at + 1)).toBeUndefined()
  })
})
