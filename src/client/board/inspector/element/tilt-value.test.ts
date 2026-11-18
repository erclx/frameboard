import { describe, expect, it } from 'vitest'

import {
  parseTilt,
  type Tilt,
  tiltTransform,
  UNTILTED,
  withField,
} from './tilt-value'

function tiltOf(overrides: Partial<Tilt> = {}): Tilt {
  return { ...UNTILTED, ...overrides }
}

describe('parseTilt', () => {
  it('reads no transform as untilted', () => {
    expect(parseTilt('')).toEqual(UNTILTED)
  })

  it('reads none as untilted', () => {
    expect(parseTilt('none')).toEqual(UNTILTED)
  })

  it('reads every function in the fixed order', () => {
    expect(
      parseTilt(
        'perspective(800px) translateZ(12px) rotateX(20deg) rotateY(-30deg) rotateZ(5.5deg)',
      ),
    ).toEqual({
      perspective: 800,
      depth: 12,
      rotateX: 20,
      rotateY: -30,
      rotateZ: 5.5,
    })
  })

  it('reads a subset in order, leaving the rest at zero', () => {
    expect(parseTilt('rotateY(15deg)')).toEqual(tiltOf({ rotateY: 15 }))
  })

  it('reads function names in any case, as CSS does', () => {
    expect(parseTilt('PERSPECTIVE(600px) rotatex(10deg)')).toEqual(
      tiltOf({ perspective: 600, rotateX: 10 }),
    )
  })

  it('reads a unitless zero', () => {
    expect(parseTilt('perspective(800px) translateZ(0) rotateX(0)')).toEqual(
      tiltOf({ perspective: 800 }),
    )
  })

  it('refuses functions in another order', () => {
    expect(parseTilt('rotateY(10deg) perspective(800px)')).toBeNull()
  })

  it('refuses a function stated twice', () => {
    expect(parseTilt('rotateX(10deg) rotateX(5deg)')).toBeNull()
  })

  it('refuses a function the section does not write', () => {
    expect(parseTilt('translate(10px, 0) rotateX(10deg)')).toBeNull()
  })

  it('refuses a matrix', () => {
    expect(parseTilt('matrix(1, 0, 0, 1, 0, 0)')).toBeNull()
  })

  it('refuses another angle unit', () => {
    expect(parseTilt('rotateX(0.1turn)')).toBeNull()
  })

  it('refuses a perspective of zero', () => {
    expect(parseTilt('perspective(0px) rotateX(10deg)')).toBeNull()
  })
})

describe('tiltTransform', () => {
  it('writes the functions in the fixed order', () => {
    expect(
      tiltTransform({
        perspective: 800,
        depth: 12,
        rotateX: 20,
        rotateY: -30,
        rotateZ: 45,
      }),
    ).toBe(
      'perspective(800px) translateZ(12px) rotateX(20deg) rotateY(-30deg) rotateZ(45deg)',
    )
  })

  it('leaves out each zero', () => {
    expect(tiltTransform(tiltOf({ perspective: 800, rotateY: 10 }))).toBe(
      'perspective(800px) rotateY(10deg)',
    )
  })

  it('writes no perspective where none is stated', () => {
    expect(tiltTransform(tiltOf({ rotateX: 10 }))).toBe('rotateX(10deg)')
  })

  it('drops the declaration where every rotation and the depth are zero', () => {
    expect(tiltTransform(tiltOf({ perspective: 800 }))).toBe('')
  })

  it('rounds to two places', () => {
    expect(tiltTransform(tiltOf({ rotateX: 1 / 3 }))).toBe('rotateX(0.33deg)')
  })

  it('reads back as the tilt it wrote', () => {
    const tilt = tiltOf({ perspective: 500, depth: -4, rotateZ: 90 })

    expect(parseTilt(tiltTransform(tilt))).toEqual(tilt)
  })
})

describe('withField', () => {
  it('takes the default perspective on a first tilt', () => {
    expect(withField(UNTILTED, 'rotateX', 20)).toEqual(
      tiltOf({ perspective: 800, rotateX: 20 }),
    )
  })

  it('keeps a tilt flat that states no perspective', () => {
    expect(withField(tiltOf({ rotateX: 20 }), 'rotateY', 10)).toEqual(
      tiltOf({ rotateX: 20, rotateY: 10 }),
    )
  })

  it('keeps a perspective already stated on a first tilt', () => {
    expect(withField(tiltOf({ perspective: 400 }), 'depth', 8)).toEqual(
      tiltOf({ perspective: 400, depth: 8 }),
    )
  })

  it('sets the perspective itself', () => {
    expect(withField(tiltOf({ rotateX: 5 }), 'perspective', 300)).toEqual(
      tiltOf({ perspective: 300, rotateX: 5 }),
    )
  })
})
