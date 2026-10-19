import { describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { frameAt, framesIn } from './hit'

const BACK = frameOf('back', {
  box: { x: 0, y: 0, width: 400, height: 300 },
  order: 0,
})
const FRONT = frameOf('front', {
  box: { x: 200, y: 100, width: 400, height: 300 },
  order: 1,
})
const HIDDEN = frameOf('hidden', {
  box: { x: 0, y: 0, width: 800, height: 800 },
  order: 2,
  hidden: true,
})

describe('frameAt', () => {
  it('answers the topmost frame where two overlap', () => {
    expect(frameAt([BACK, FRONT], { x: 300, y: 200 }, 1)?.name).toBe('front')
  })

  it('answers the frame beneath where only it sits', () => {
    expect(frameAt([BACK, FRONT], { x: 50, y: 50 }, 1)?.name).toBe('back')
  })

  it('counts the label strip above a frame as the frame', () => {
    expect(frameAt([BACK], { x: 10, y: -15 }, 1)?.name).toBe('back')
  })

  it('keeps the strip its screen height when zoomed out', () => {
    expect(frameAt([BACK], { x: 10, y: -60 }, 0.25)?.name).toBe('back')
  })

  it('answers nothing above the strip', () => {
    expect(frameAt([BACK], { x: 10, y: -25 }, 1)).toBeNull()
  })

  it('never hits a hidden frame', () => {
    expect(frameAt([BACK, HIDDEN], { x: 700, y: 700 }, 1)).toBeNull()
  })
})

describe('framesIn', () => {
  it('answers every shown frame the rectangle touches', () => {
    const touched = framesIn([BACK, FRONT, HIDDEN], {
      x: 350,
      y: 50,
      width: 100,
      height: 100,
    })

    expect(touched.map((frame) => frame.name)).toEqual(['back', 'front'])
  })

  it('answers nothing for a rectangle over empty canvas', () => {
    expect(
      framesIn([BACK, FRONT], { x: 700, y: 700, width: 50, height: 50 }),
    ).toEqual([])
  })
})
