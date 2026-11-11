import { describe, expect, it } from 'vitest'

import type { SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { stepFrom, stepOrder } from './frame-order'

function sectionOf(name: string, frames: string[], order = 0): SectionRecord {
  return {
    name,
    box: { x: 0, y: 0, width: 1000, height: 1000 },
    order,
    frames,
  }
}

const names = (frames: readonly { name: string }[]) =>
  frames.map((frame) => frame.name)

describe('stepOrder', () => {
  it('runs top of the stack first with no sections', () => {
    const frames = [frameOf('a'), frameOf('b'), frameOf('c')]

    expect(names(stepOrder(frames, []))).toEqual(['c', 'b', 'a'])
  })

  it('runs the sections top first, then the frames in none', () => {
    const frames = ['a', 'b', 'c', 'd', 'e'].map((name) => frameOf(name))
    const sections = [
      sectionOf('lower', ['a', 'c'], 0),
      sectionOf('upper', ['d'], 1),
    ]

    expect(names(stepOrder(frames, sections))).toEqual([
      'd',
      'c',
      'a',
      'e',
      'b',
    ])
  })

  it('leaves out a hidden frame', () => {
    const frames = [frameOf('a'), frameOf('b', { hidden: true }), frameOf('c')]

    expect(names(stepOrder(frames, []))).toEqual(['c', 'a'])
  })
})

describe('stepFrom', () => {
  const order = [frameOf('a'), frameOf('b'), frameOf('c')]

  it('steps to the next frame', () => {
    expect(stepFrom(order, frameOf('a').ref, 1)?.name).toBe('b')
  })

  it('steps to the previous frame', () => {
    expect(stepFrom(order, frameOf('b').ref, -1)?.name).toBe('a')
  })

  it('wraps from the last frame to the first', () => {
    expect(stepFrom(order, frameOf('c').ref, 1)?.name).toBe('a')
  })

  it('wraps from the first frame to the last', () => {
    expect(stepFrom(order, frameOf('a').ref, -1)?.name).toBe('c')
  })

  it('answers nothing for a frame outside the order', () => {
    expect(stepFrom(order, frameOf('z').ref, 1)).toBeUndefined()
  })
})
