import { describe, expect, it } from 'vitest'

import type { AssetFile } from '@/shared/records/assets'

import {
  assetUrl,
  describeAsset,
  describeUsage,
  formatSize,
  linkPath,
} from './describe'

describe('describeAsset', () => {
  it.each<[AssetFile, string]>([
    [{ path: 'hero.png', kind: 'image', size: 1_200_000 }, 'image · 1.2 MB'],
    [{ path: 'loader.gif', kind: 'gif', size: 240_000 }, 'GIF · 240 KB'],
    [{ path: 'logo.svg', kind: 'svg', size: 2_000 }, 'SVG · 2 KB'],
    [{ path: 'Inter.woff2', kind: 'font', size: 98_000 }, 'font · 98 KB'],
    [{ path: 'demo.mp4', kind: 'video', size: 4_100_000 }, 'video · 4.1 MB'],
    [
      { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
      'stylesheet · 3 KB',
    ],
  ])('draws %j as %s', (file, line) => {
    expect(describeAsset(file)).toBe(line)
  })
})

describe('describeUsage', () => {
  const file: AssetFile = { path: 'logo.svg', kind: 'svg', size: 1 }

  it.each<[number, string]>([
    [0, 'Unused'],
    [1, '1 frame'],
    [3, '3 frames'],
  ])('names %i linking frames as %s', (frames, line) => {
    expect(describeUsage({ ...file, frames })).toBe(line)
  })

  it('names nothing where the listing carries no count', () => {
    expect(describeUsage(file)).toBeNull()
  })
})

describe('formatSize', () => {
  it('counts bytes under a kilobyte and drops a trailing .0', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(999)).toBe('999 B')
    expect(formatSize(2_000_000)).toBe('2 MB')
  })

  it('moves to megabytes rather than showing 1000 KB', () => {
    expect(formatSize(999_999)).toBe('1 MB')
  })
})

describe('linkPath', () => {
  it('walks one level up to the project assets', () => {
    expect(linkPath('hero.png')).toBe('../assets/hero.png')
  })

  it('encodes each segment and keeps the slashes', () => {
    expect(linkPath('img/Hero Image#1.png')).toBe(
      '../assets/img/Hero%20Image%231.png',
    )
  })
})

describe('assetUrl', () => {
  it('points at the frame route for the project assets', () => {
    expect(assetUrl('my studio', 'img/a b.png')).toBe(
      '/frames/my%20studio/assets/img/a%20b.png',
    )
  })
})
