import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import { compositeBounds, compositeImagePath, frameImagePath } from './images'

const PAGE = { ref: 'studio/home', project: 'studio', name: 'home' }

function at(x: number, y: number, width: number, height: number) {
  return { box: { x, y, width, height } }
}

describe('compositeBounds', () => {
  it('shifts the topmost and leftmost frames 40 px in, with 40 px past the far edges', () => {
    const bounds = compositeBounds(PAGE, [
      at(100, 50, 400, 300),
      at(580, 170, 320, 200),
    ])

    expect(bounds).toEqual({ width: 880, height: 400, dx: -60, dy: -10 })
  })

  it('places frames at negative board positions inside the image', () => {
    const bounds = compositeBounds(PAGE, [at(-200, -100, 100, 100)])

    expect(bounds).toEqual({ width: 180, height: 180, dx: 240, dy: 140 })
  })

  it('accepts a composite exactly 16384 px wide', () => {
    expect(compositeBounds(PAGE, [at(0, 0, 16304, 10)]).width).toBe(16384)
  })

  it('refuses a composite whose side passes the limit only at its scale', () => {
    expect(() => compositeBounds(PAGE, [at(0, 0, 8153, 10)], 2)).toThrow(
      expect.objectContaining({ code: 'capture-too-large' }),
    )
  })

  it('refuses capture-too-large, exit 10, one pixel past the limit', () => {
    let refusal: unknown
    try {
      compositeBounds(PAGE, [at(0, 0, 10, 16305)])
    } catch (error) {
      refusal = error
    }

    expect(refusal).toBeInstanceOf(FrameboardError)
    expect(refusal).toMatchObject({
      code: 'capture-too-large',
      exitCode: 10,
      details: { ref: 'studio/home', width: 90, height: 16385 },
    })
  })
})

describe('image paths', () => {
  const frame = { project: 'studio', page: 'home', name: 'hero' }

  it('names a 1x frame image with no scale suffix', () => {
    expect(frameImagePath('/out', frame, 'light', 1)).toBe(
      '/out/studio/home/hero.light.png',
    )
  })

  it('names a scaled frame image with its scale', () => {
    expect(frameImagePath('/out', frame, 'dark', 3)).toBe(
      '/out/studio/home/hero.dark@3x.png',
    )
  })

  it('names a scaled composite with its scale', () => {
    expect(compositeImagePath('/out', PAGE, 'light', 2)).toBe(
      '/out/studio/home.light@2x.png',
    )
  })
})
