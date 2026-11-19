import { describe, expect, it } from 'vitest'

import { fitFromPointer, naturalSize, placedSize } from './asset-size'

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
  it('caps a tall file at the height of room with its ratio kept', () => {
    expect(placedSize({ width: 1000, height: 800 }, 1440, 400)).toEqual({
      width: 500,
      height: 400,
    })
  })

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

  it('keeps a tall file within the 10,000px side the route takes', () => {
    expect(placedSize({ width: 1440, height: 15000 }, 1440)).toEqual({
      width: 960,
      height: 10000,
    })
  })

  it('keeps a wide file within the route side in a container with no width', () => {
    expect(placedSize({ width: 20000, height: 500 }, 0)).toEqual({
      width: 10000,
      height: 250,
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
  it('lands audio 300px wide without loading the file', async () => {
    expect(
      (await naturalSize('data:audio/ogg,not-a-clip', 'audio'))?.width,
    ).toBe(300)
  })

  it('answers null for a model, which lands at the fallback box, without loading it', async () => {
    expect(
      await naturalSize('data:model/gltf-binary,not-a-model', 'model'),
    ).toBeNull()
    expect(placedSize(null, 0)).toEqual({ width: 240, height: 135 })
  })

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

describe('fitFromPointer', () => {
  it('keeps a file that fits past the pointer whole and in place', () => {
    expect(
      fitFromPointer({ width: 320, height: 180 }, 1440, { x: 600, y: 400 }),
    ).toEqual({ size: { width: 320, height: 180 }, back: { x: 0, y: 0 } })
  })

  it('caps a file by the width left to the right edge', () => {
    expect(
      fitFromPointer({ width: 1023, height: 768 }, 1440, { x: 432, y: 900 }),
    ).toEqual({ size: { width: 432, height: 324 }, back: { x: 0, y: 0 } })
  })

  it('caps a file by the height left to the bottom edge', () => {
    expect(
      fitFromPointer({ width: 1023, height: 768 }, 1440, { x: 1200, y: 192 }),
    ).toEqual({ size: { width: 256, height: 192 }, back: { x: 0, y: 0 } })
  })

  it('caps a file by the container width before the edge', () => {
    expect(
      fitFromPointer({ width: 1000, height: 500 }, 300, { x: 900, y: 900 }),
    ).toEqual({ size: { width: 300, height: 150 }, back: { x: 0, y: 0 } })
  })

  it('lands 40 pixels wide where only 40 are left', () => {
    expect(
      fitFromPointer({ width: 1023, height: 768 }, 1440, { x: 40, y: 900 }),
    ).toEqual({ size: { width: 40, height: 30 }, back: { x: 0, y: 0 } })
  })

  it('caps the fallback a model takes the same way', () => {
    expect(fitFromPointer(null, 1440, { x: 120, y: 900 })).toEqual({
      size: { width: 120, height: 68 },
      back: { x: 0, y: 0 },
    })
  })

  it('shifts back from an edge with under 24 pixels left, landing at its smallest', () => {
    expect(
      fitFromPointer({ width: 400, height: 400 }, 1440, { x: 10, y: 4 }),
    ).toEqual({ size: { width: 24, height: 24 }, back: { x: 14, y: 20 } })
  })
})
