import { describe, expect, it } from 'vitest'

import { assetKind, isPlaceableKind } from './asset-kinds'

describe('isPlaceableKind', () => {
  it('takes an image, a GIF, an SVG, and a video', () => {
    expect(['image', 'gif', 'svg', 'video'].map(isPlaceableKind)).toEqual([
      true,
      true,
      true,
      true,
    ])
  })

  it('refuses audio, a font, a stylesheet, a script, and an unknown file', () => {
    expect(
      ['audio', 'font', 'stylesheet', 'script', 'other'].map(isPlaceableKind),
    ).toEqual([false, false, false, false, false])
  })

  it('refuses a value that is no kind at all', () => {
    expect(isPlaceableKind(undefined)).toBe(false)
  })
})

describe('assetKind', () => {
  it('reads an .m4v file as a video', () => {
    expect(assetKind('clip.M4V')).toBe('video')
  })
})
