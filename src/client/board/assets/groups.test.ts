import { describe, expect, it } from 'vitest'

import type { AssetFile } from '@/shared/records/assets'

import {
  chipCounts,
  chipOf,
  groupAssets,
  withoutFonts,
  withoutKits,
} from './groups'

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
    ['audio', 'audio'],
    ['model', 'models'],
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

describe('withoutFonts', () => {
  it("leaves out each installed family's files and counts the families", () => {
    const listed = withoutFonts(
      [
        file('lake.jpg'),
        file('fonts/lora/latin-wght-normal.woff2', 'font'),
        file('fonts/lora/LICENSE.txt', 'other'),
        file('fonts/playfair-display/latin-400-normal.woff2', 'font'),
      ],
      ['fonts/lora', 'fonts/playfair-display'],
    )

    expect(listed).toEqual({ files: [file('lake.jpg')], fonts: 2 })
  })

  it('keeps a hand-filled folder under fonts/ the installed list does not name', () => {
    const listed = withoutFonts(
      [
        file('fonts/lora/latin-wght-normal.woff2', 'font'),
        file('fonts/brand/brand.woff2', 'font'),
      ],
      ['fonts/lora'],
    )

    expect(listed).toEqual({
      files: [file('fonts/brand/brand.woff2', 'font')],
      fonts: 1,
    })
  })

  it('keeps a folder whose name only opens with an installed one', () => {
    const listed = withoutFonts(
      [file('fonts/lora-extra/a.woff2', 'font')],
      ['fonts/lora'],
    )

    expect(listed.files).toEqual([file('fonts/lora-extra/a.woff2', 'font')])
  })
})

describe('withoutKits', () => {
  it("leaves out every kit's files and counts the kits they came from", () => {
    const listed = withoutKits([
      file('lake.jpg'),
      file('kits/clean/kit.css', 'stylesheet'),
      file('kits/clean/kit.json', 'other'),
      file('kits/sketch/kit.css', 'stylesheet'),
      file('icons/star.svg', 'svg'),
    ])

    expect(listed).toEqual({
      files: [file('lake.jpg'), file('icons/star.svg', 'svg')],
      kits: 2,
    })
  })

  it('keeps a file named like the kits folder outside it', () => {
    const listed = withoutKits([file('kits.png'), file('art/kits/a.png')])

    expect(listed).toEqual({
      files: [file('kits.png'), file('art/kits/a.png')],
      kits: 0,
    })
  })

  it('answers no files and the kit count for a folder holding only kits', () => {
    const listed = withoutKits([file('kits/clean/kit.css', 'stylesheet')])

    expect(listed).toEqual({ files: [], kits: 1 })
  })
})
