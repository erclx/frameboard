import { describe, expect, it } from 'vitest'

import type { AssetFile } from '@/shared/records/assets'

import { chipCounts, chipOf, groupAssets } from './groups'

function file(path: string, kind: AssetFile['kind'] = 'image'): AssetFile {
  return { path, kind, size: 1 }
}

describe('chipOf', () => {
  it.each([
    ['image', 'images'],
    ['gif', 'images'],
    ['svg', 'images'],
    ['video', 'video'],
    ['font', 'fonts'],
    ['audio', 'other'],
    ['stylesheet', 'other'],
    ['script', 'other'],
    ['other', 'other'],
  ] as const)('files a %s under %s', (kind, chip) => {
    expect(chipOf(kind)).toBe(chip)
  })
})

describe('chipCounts', () => {
  it('counts each chip and leaves out a chip with no files', () => {
    const counts = chipCounts([
      file('a.png'),
      file('b.svg', 'svg'),
      file('c.woff2', 'font'),
    ])

    expect(counts).toEqual([
      { chip: 'all', count: 3 },
      { chip: 'images', count: 2 },
      { chip: 'fonts', count: 1 },
    ])
  })

  it('keeps All on an empty folder', () => {
    expect(chipCounts([])).toEqual([{ chip: 'all', count: 0 }])
  })
})

describe('groupAssets', () => {
  const FILES = [
    file('brand.woff2', 'font'),
    file('icons/star.svg', 'svg'),
    file('icons/ui/close.svg', 'svg'),
    file('logo.svg', 'svg'),
    file('clip.mp4', 'video'),
  ]

  it('puts root files first, then each folder by path', () => {
    const groups = groupAssets(FILES, { chip: 'all', search: '' })

    expect(groups.map((group) => group.folder)).toEqual([
      '',
      'icons',
      'icons/ui',
    ])
    expect(groups[0]?.files.map((entry) => entry.path)).toEqual([
      'brand.woff2',
      'logo.svg',
      'clip.mp4',
    ])
  })

  it('names a nested folder by its path under assets/', () => {
    const groups = groupAssets([file('icons/ui/close.svg')], {
      chip: 'all',
      search: '',
    })

    expect(groups).toEqual([
      { folder: 'icons/ui', files: [file('icons/ui/close.svg')] },
    ])
  })

  it('keeps only the files under the chosen chip', () => {
    const groups = groupAssets(FILES, { chip: 'fonts', search: '' })

    expect(groups).toEqual([{ folder: '', files: [FILES[0]] }])
  })

  it('narrows by a search on the path, in any case', () => {
    const groups = groupAssets(FILES, { chip: 'all', search: 'STAR' })

    expect(groups).toEqual([{ folder: 'icons', files: [FILES[1]] }])
  })

  it('matches a search against the folder too', () => {
    const groups = groupAssets(FILES, { chip: 'all', search: 'icons/' })

    expect(groups.map((group) => group.folder)).toEqual(['icons', 'icons/ui'])
  })

  it('answers no groups when nothing matches', () => {
    expect(groupAssets(FILES, { chip: 'video', search: 'logo' })).toEqual([])
  })
})
