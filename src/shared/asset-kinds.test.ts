import { describe, expect, it } from 'vitest'

import { assetKind, isPlaceableKind } from './asset-kinds'

describe('isPlaceableKind', () => {
  it('takes an image, a GIF, an SVG, a video, and audio', () => {
    expect(
      ['image', 'gif', 'svg', 'video', 'audio'].map(isPlaceableKind),
    ).toEqual([true, true, true, true, true])
  })

  it('refuses a font, a stylesheet, a script, and an unknown file', () => {
    expect(
      ['font', 'stylesheet', 'script', 'other'].map(isPlaceableKind),
    ).toEqual([false, false, false, false])
  })

  it('refuses a value that is no kind at all', () => {
    expect(isPlaceableKind(undefined)).toBe(false)
  })
})

describe('assetKind', () => {
  it('reads a .glb and a .gltf as a model', () => {
    expect(['phone.GLB', 'scene.gltf'].map(assetKind)).toEqual([
      'model',
      'model',
    ])
  })

  it('leaves a model file no frame shows as an unknown file', () => {
    expect(assetKind('chair.fbx')).toBe('other')
  })

  it('reads an .m4v file as a video', () => {
    expect(assetKind('clip.M4V')).toBe('video')
  })
})
