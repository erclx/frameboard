import { describe, expect, it } from 'vitest'

import { cardFrames } from './card-frames'

const frame = (ref: string, hidden = false) => ({ ref, hidden })

describe('cardFrames', () => {
  it('draws the first page when it holds a visible frame', () => {
    const pages = [
      { frames: [frame('a/home/hero'), frame('a/home/footer', true)] },
      { frames: [frame('a/about/team')] },
    ]

    expect(cardFrames({ pages }).map((f) => f.ref)).toEqual(['a/home/hero'])
  })

  it('passes a first page whose frames are all hidden', () => {
    const pages = [
      { frames: [frame('a/settings/profile', true)] },
      { frames: [frame('a/home/hero'), frame('a/home/menu')] },
    ]

    expect(cardFrames({ pages }).map((f) => f.ref)).toEqual([
      'a/home/hero',
      'a/home/menu',
    ])
  })

  it('passes an empty first page', () => {
    const pages = [{ frames: [] }, { frames: [frame('a/home/hero')] }]

    expect(cardFrames({ pages }).map((f) => f.ref)).toEqual(['a/home/hero'])
  })

  it('draws nothing when no page holds a visible frame', () => {
    const pages = [{ frames: [frame('a/home/hero', true)] }, { frames: [] }]

    expect(cardFrames({ pages })).toEqual([])
  })
})
