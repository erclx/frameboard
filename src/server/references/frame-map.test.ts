import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  frameTargets,
  mappedTarget,
  missingFrames,
  parseFrameMap,
} from './frame-map'

function refusal(json: string): FrameboardError {
  try {
    parseFrameMap(json)
  } catch (error) {
    if (error instanceof FrameboardError) return error
    throw error
  }
  throw new Error('parseFrameMap did not refuse.')
}

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

    const error = refusal(json)

    expect(error.code).toBe('frame-map-invalid')
    expect(error.message).toContain('Home/grid-dark.png')
  })

  it('should read a reference one folder deeper, as a group, a section, and a name', () => {
    const json = JSON.stringify({
      frames: { 'landing/hero/390': 'landing-v2/shipped/hero-390' },
    })

    expect(parseFrameMap(json)).toEqual(
      new Map([['landing/hero/390', 'landing-v2/shipped/hero-390']]),
    )
  })

  it('should refuse a reference four segments deep, naming it', () => {
    const json = JSON.stringify({
      frames: { 'landing/hero/wide/390': 'landing-v2/shipped/hero-390' },
    })

    const error = refusal(json)

    expect(error.code).toBe('frame-map-invalid')
    expect(error.message).toContain('landing/hero/wide/390')
  })

  it('should refuse a reference with an empty segment', () => {
    const json = JSON.stringify({
      frames: { 'landing//390': 'landing-v2/shipped/hero-390' },
    })

    expect(refusal(json).code).toBe('frame-map-invalid')
  })

  it('should refuse a board ref missing its project, page, or frame', () => {
    const json = JSON.stringify({ frames: { 'home/grid': '07-home/arm-2' } })

    const error = refusal(json)

    expect(error.code).toBe('frame-map-invalid')
    expect(error.message).toContain('home/grid')
  })

  it('should refuse a file with no frames object', () => {
    expect(refusal('{"surfaces": []}').code).toBe('frame-map-invalid')
  })

  it('should refuse frames given as a list', () => {
    expect(refusal('{"frames": []}').code).toBe('frame-map-invalid')
  })

  it('should refuse a map of no frames, which a sync would read as removing every reference', () => {
    expect(refusal('{"frames": {}}').code).toBe('frame-map-invalid')
  })

  it('should refuse a file that is not JSON', () => {
    expect(refusal('{ frames').code).toBe('frame-map-invalid')
  })
})

describe('parseFrameMap with a width', () => {
  it('should read a board frame at a width', () => {
    const json = JSON.stringify({
      frames: { 'home/grid-tablet': 'design/07-home/arm-2@834' },
    })

    expect(parseFrameMap(json)).toEqual(
      new Map([['home/grid-tablet', 'design/07-home/arm-2@834']]),
    )
  })

  it.each([
    'design/07-home/arm-2@',
    'design/07-home/arm-2@0',
    'design/07-home/arm-2@wide',
  ])('should refuse %s', (ref) => {
    const json = JSON.stringify({ frames: { 'home/grid': ref } })

    expect(refusal(json).code).toBe('frame-map-invalid')
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

  it('should name a width the frame does not show at', () => {
    const map = new Map([
      ['home/grid-tablet', 'design/07-home/arm-2@834'],
      ['home/grid-phone', 'design/07-home/arm-2@375'],
    ])
    const board = new Set(
      frameTargets({
        ref: 'design/07-home/arm-2',
        box: { width: 1440 },
        widths: [{ width: 834 }, { width: 390 }],
      }),
    )

    expect(missingFrames(map, board)).toEqual(['design/07-home/arm-2@375'])
  })
})

describe('mappedTarget', () => {
  it('should read a value with no width as the frame alone', () => {
    expect(mappedTarget('design/07-home/arm-2')).toEqual({
      ref: 'design/07-home/arm-2',
    })
  })

  it('should read the width after @', () => {
    expect(mappedTarget('design/07-home/arm-2@834')).toEqual({
      ref: 'design/07-home/arm-2',
      width: 834,
    })
  })
})
