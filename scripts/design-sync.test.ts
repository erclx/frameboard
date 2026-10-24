import { describe, expect, it } from 'vitest'

import {
  classifyDrift,
  MappingError,
  missingFrames,
  parseFrameMap,
  toReference,
} from './lib/design-reference.ts'

describe('parseFrameMap', () => {
  it('should read each reference and the board frame it is captured from', () => {
    const json = JSON.stringify({
      frames: {
        'foundations/logo': 'design/03-logo/picked-arm-5c',
        'home/grid': 'design/07-home/arm-2',
      },
    })

    expect(parseFrameMap(json)).toEqual(
      new Map([
        ['foundations/logo', 'design/03-logo/picked-arm-5c'],
        ['home/grid', 'design/07-home/arm-2'],
      ]),
    )
  })

  it('should refuse a reference that is not a group and a name, naming it', () => {
    const json = JSON.stringify({
      frames: { 'Home/grid-dark.png': 'design/07-home/arm-2' },
    })

    expect(() => parseFrameMap(json)).toThrow(MappingError)
    expect(() => parseFrameMap(json)).toThrow('Home/grid-dark.png')
  })

  it('should refuse a board ref missing its project, page, or frame', () => {
    const json = JSON.stringify({ frames: { 'home/grid': '07-home/arm-2' } })

    expect(() => parseFrameMap(json)).toThrow('home/grid')
  })

  it('should refuse a file with no frames object', () => {
    expect(() => parseFrameMap('{"surfaces": []}')).toThrow(MappingError)
  })
})

describe('missingFrames', () => {
  it('should name each mapped board frame the board does not hold', () => {
    const map = new Map([
      ['home/grid', 'design/07-home/arm-2'],
      ['home/list', 'design/07-home/home-list'],
    ])

    expect(missingFrames(map, new Set(['design/07-home/arm-2']))).toEqual([
      'design/07-home/home-list',
    ])
  })
})

describe('toReference', () => {
  it('should point the board project kit links at the folder kit', () => {
    const html =
      '<link href="../assets/kit/kit.css"><script src="../assets/kit/vendor/rough.js"></script>'

    expect(toReference(html)).toBe(
      '<link href="../kit/kit.css"><script src="../kit/vendor/rough.js"></script>',
    )
  })
})

describe('classifyDrift', () => {
  it('should fail the HTML and the file set and only warn on PNG bytes', () => {
    const drift = classifyDrift(
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b2</p>'],
        ['x/c.png', new Uint8Array([1, 2])],
        ['x/d.png', new Uint8Array([3])],
      ]),
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b</p>'],
        ['x/c.png', new Uint8Array([1, 9])],
        ['x/old.png', new Uint8Array([4])],
      ]),
    )

    expect(drift).toEqual({
      changed: ['x/b.html'],
      pngDiffers: ['x/c.png'],
      missing: ['x/d.png'],
      stray: ['x/old.png'],
    })
  })
})
