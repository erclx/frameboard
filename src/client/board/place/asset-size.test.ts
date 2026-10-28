import { describe, expect, it } from 'vitest'

import { naturalSize, placedSize } from './asset-size'

const svg = (attributes: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`)}`

/** A blank PNG of the given size, as a data URL. */
async function pixelPng(width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.toDataURL('image/png')
}

describe('placedSize', () => {
  it('keeps a file narrower than its container at its natural size', () => {
    expect(placedSize({ width: 320, height: 180 }, 600)).toEqual({
      width: 320,
      height: 180,
    })
  })

  it('caps a wide file at the container width with its ratio kept', () => {
    expect(placedSize({ width: 4000, height: 3000 }, 400)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('lands a file with no size at 240 by 135', () => {
    expect(placedSize(null, 600)).toEqual({ width: 240, height: 135 })
  })

  it('caps the fallback in a narrow container too', () => {
    expect(placedSize(null, 120)).toEqual({ width: 120, height: 68 })
  })

  it('never answers a side under one pixel', () => {
    expect(placedSize({ width: 4000, height: 2 }, 400)).toEqual({
      width: 400,
      height: 1,
    })
  })

  it('caps nothing in a container with no width', () => {
    expect(placedSize({ width: 320, height: 180 }, 0)).toEqual({
      width: 320,
      height: 180,
    })
  })
})

describe('naturalSize', () => {
  it('reads the size an SVG states', async () => {
    expect(await naturalSize(svg('width="64" height="32"'), 'svg')).toEqual({
      width: 64,
      height: 32,
    })
  })

  it('reads an SVG stating only a view box at that box', async () => {
    expect(await naturalSize(svg('viewBox="0 0 24 12"'), 'svg')).toEqual({
      width: 24,
      height: 12,
    })
  })

  it('answers null for an SVG stating no size', async () => {
    expect(await naturalSize(svg(''), 'svg')).toBeNull()
  })

  it('answers null for an SVG sized in percent with no view box', async () => {
    expect(
      await naturalSize(svg('width="100%" height="100%"'), 'svg'),
    ).toBeNull()
  })

  it('reads the natural size of an image', async () => {
    const png = await pixelPng(3, 2)

    expect(await naturalSize(png, 'image')).toEqual({ width: 3, height: 2 })
  })

  it('answers null for a file that does not load', async () => {
    expect(await naturalSize('/nothing-here.png', 'image')).toBeNull()
  })

  it('answers null for a video whose metadata never loads', async () => {
    expect(await naturalSize('/nothing-here.mp4', 'video', 200)).toBeNull()
  })
})
