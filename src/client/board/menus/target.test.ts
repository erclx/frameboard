import { describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { menuTarget } from './target'

const BACK = frameOf('back', {
  box: { x: 0, y: 100, width: 400, height: 300 },
  order: 0,
})
const FRONT = frameOf('front', {
  box: { x: 200, y: 200, width: 400, height: 300 },
  order: 1,
})
const FRAMES = [BACK, FRONT]

/** An element selected inside the back frame, drawn at this box on the canvas. */
const ELEMENT = {
  frame: BACK.ref,
  box: { x: 20, y: 120, width: 100, height: 40 },
}

describe('menuTarget', () => {
  it('answers the selected element when the point sits inside its box', () => {
    const target = menuTarget(FRAMES, { x: 50, y: 130 }, 1, ELEMENT)

    expect(target).toEqual({
      kind: 'element',
      frame: BACK,
      at: { x: 50, y: 130 },
    })
  })

  it('answers the frame when the point sits in it outside the selected element', () => {
    const target = menuTarget(FRAMES, { x: 150, y: 300 }, 1, ELEMENT)

    expect(target).toEqual({
      kind: 'frame',
      frame: BACK,
      at: { x: 150, y: 300 },
    })
  })

  it('answers the topmost frame where two overlap', () => {
    const target = menuTarget(FRAMES, { x: 300, y: 300 }, 1, null)

    expect(target).toMatchObject({ kind: 'frame', frame: FRONT })
  })

  it('answers empty canvas, with the point, where no frame sits', () => {
    const target = menuTarget(FRAMES, { x: 700, y: 50 }, 1, null)

    expect(target).toEqual({ kind: 'canvas', at: { x: 700, y: 50 } })
  })

  it('counts the label strip above a frame as the frame at 100 percent', () => {
    expect(menuTarget(FRAMES, { x: 50, y: 85 }, 1, null).kind).toBe('frame')
  })

  it('leaves the same point to the canvas at 100 percent once it clears the strip', () => {
    expect(menuTarget(FRAMES, { x: 50, y: 70 }, 1, null).kind).toBe('canvas')
  })

  it('widens the strip on the board as the view zooms out, keeping its screen size', () => {
    expect(menuTarget(FRAMES, { x: 50, y: 70 }, 0.5, null).kind).toBe('frame')
  })

  it('answers the frame when the element box belongs to a frame no longer shown', () => {
    const gone = { frame: 'studio/home/gone', box: ELEMENT.box }

    expect(menuTarget(FRAMES, { x: 50, y: 130 }, 1, gone)).toMatchObject({
      kind: 'frame',
      frame: BACK,
    })
  })
})
