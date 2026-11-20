import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

import { keptImages, type ReferenceFiles } from './keep'

function png(width: number, height: number, fill = 0): Buffer {
  const image = new PNG({ width, height })
  image.data.fill(fill)
  return PNG.sync.write(image)
}

const GRID: ReferenceFiles = {
  sources: ['home/grid.html', 'assets/design/kit.css'],
  images: ['home/grid-light.png', 'home/grid-dark.png'],
}

/** What the folder holds for the grid after an earlier sync. */
function held(): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['home/grid.html', '<p>grid</p>'],
    ['assets/design/kit.css', 'body {}'],
    ['home/grid-light.png', png(4, 3, 10)],
    ['home/grid-dark.png', png(4, 3, 20)],
  ])
}

/** What a sync now captures for the grid, its PNGs rendered differently. */
function captured(
  changes: Record<string, string | Uint8Array> = {},
): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['home/grid.html', '<p>grid</p>'],
    ['assets/design/kit.css', 'body {}'],
    ['home/grid-light.png', png(4, 3, 200)],
    ['home/grid-dark.png', png(4, 3, 210)],
    ...Object.entries(changes),
  ])
}

describe('keptImages', () => {
  it('keeps both held PNGs when the HTML, assets, and size held still', () => {
    expect(keptImages([GRID], captured(), held())).toEqual([
      'home/grid-dark.png',
      'home/grid-light.png',
    ])
  })

  it('keeps none when the HTML changed', () => {
    expect(
      keptImages([GRID], captured({ 'home/grid.html': '<p>new</p>' }), held()),
    ).toEqual([])
  })

  it('keeps none when an asset the frame loads changed', () => {
    expect(
      keptImages(
        [GRID],
        captured({ 'assets/design/kit.css': 'body { color: red }' }),
        held(),
      ),
    ).toEqual([])
  })

  it('rewrites a PNG whose capture changed size', () => {
    expect(
      keptImages(
        [GRID],
        captured({ 'home/grid-light.png': png(4, 5) }),
        held(),
      ),
    ).toEqual(['home/grid-dark.png'])
  })

  it('writes a PNG the folder lacks rather than keeping it', () => {
    const folder = held()
    folder.delete('home/grid-dark.png')

    expect(keptImages([GRID], captured(), folder)).toEqual([
      'home/grid-light.png',
    ])
  })

  it('keeps none for a new reference whose HTML the folder lacks', () => {
    const folder = held()
    folder.delete('home/grid.html')

    expect(keptImages([GRID], captured(), folder)).toEqual([])
  })
})
