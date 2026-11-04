import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import { missingFrames, parseFrameMap } from './frame-map'

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

  it('should refuse a board ref missing its project, page, or frame', () => {
    const json = JSON.stringify({ frames: { 'home/grid': '07-home/arm-2' } })

    const error = refusal(json)

    expect(error.code).toBe('frame-map-invalid')
    expect(error.message).toContain('home/grid')
  })

  it('should refuse a file with no frames object', () => {
    expect(refusal('{"surfaces": []}').code).toBe('frame-map-invalid')
  })

  it('should refuse a file that is not JSON', () => {
    expect(refusal('{ frames').code).toBe('frame-map-invalid')
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
