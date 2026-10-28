import { describe, expect, it } from 'vitest'

import { membersOf } from './sections'

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

describe('membersOf', () => {
  it('gives a frame to the section holding its center', () => {
    const sections = [{ name: 'flow', box: box(0, 0, 1000, 1000), order: 0 }]
    const frames = [{ name: 'login', box: box(100, 100, 390, 844) }]

    expect(membersOf(sections, frames).get('login')).toBe('flow')
  })

  it('leaves out a frame whose center sits outside every section', () => {
    const sections = [{ name: 'flow', box: box(0, 0, 400, 400), order: 0 }]
    const frames = [{ name: 'login', box: box(300, 300, 390, 844) }]

    expect(membersOf(sections, frames).has('login')).toBe(false)
  })

  it('counts a center on the top left edge as inside', () => {
    const sections = [{ name: 'flow', box: box(200, 100, 400, 400), order: 0 }]
    const frames = [{ name: 'login', box: box(100, 0, 200, 200) }]

    expect(membersOf(sections, frames).get('login')).toBe('flow')
  })

  it('counts a center on the bottom right edge as outside', () => {
    const sections = [{ name: 'flow', box: box(0, 0, 200, 100), order: 0 }]
    const frames = [{ name: 'login', box: box(100, 0, 200, 200) }]

    expect(membersOf(sections, frames).has('login')).toBe(false)
  })

  it('gives a center two sections hold to the topmost', () => {
    const sections = [
      { name: 'upper', box: box(0, 0, 1000, 1000), order: 1 },
      { name: 'lower', box: box(0, 0, 2000, 2000), order: 0 },
    ]
    const frames = [{ name: 'login', box: box(100, 100, 200, 200) }]

    expect(membersOf(sections, frames).get('login')).toBe('upper')
  })

  it('breaks an order tie by the later name, as stacking does', () => {
    const sections = [
      { name: 'beta', box: box(0, 0, 1000, 1000), order: 0 },
      { name: 'alpha', box: box(0, 0, 1000, 1000), order: 0 },
    ]
    const frames = [{ name: 'login', box: box(100, 100, 200, 200) }]

    expect(membersOf(sections, frames).get('login')).toBe('beta')
  })

  it('keeps a hidden frame in the section it sits in', () => {
    const sections = [{ name: 'flow', box: box(0, 0, 1000, 1000), order: 0 }]
    const frames = [
      { name: 'login', box: box(100, 100, 200, 200), hidden: true },
    ]

    expect(membersOf(sections, frames).get('login')).toBe('flow')
  })
})
