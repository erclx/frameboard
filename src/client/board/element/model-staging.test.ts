import { describe, expect, it } from 'vitest'

import type { ModelReading } from '@/shared/frame-bridge/model'

import {
  angleOf,
  depthOf,
  isEven,
  orbitStages,
  scaledTo,
  scaleOf,
  turnOf,
  turnStage,
} from './model-staging'

const UNSTAGED: ModelReading['staged'] = {
  'camera-orbit': null,
  'min-camera-orbit': null,
  'max-camera-orbit': null,
  'camera-target': null,
  'field-of-view': null,
  'max-field-of-view': null,
  orientation: null,
  scale: null,
  'animation-name': null,
  autoplay: null,
}

function reading(over: Partial<ModelReading> = {}): ModelReading {
  return {
    src: '../assets/phone.glb',
    loaded: true,
    clips: [],
    orbit: { theta: 0, phi: 75 },
    camera: { distance: 3, view: 30 },
    bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
    staged: UNSTAGED,
    ...over,
  }
}

describe('angleOf', () => {
  it('reads the angle the file states over the camera still easing toward it', () => {
    const read = reading({
      orbit: { theta: -12, phi: 70 },
      staged: { ...UNSTAGED, 'camera-orbit': '-40deg 60deg 105%' },
    })

    expect(angleOf(read)).toEqual({ theta: -40, phi: 60 })
  })

  it('reads radians as degrees', () => {
    const read = reading({
      staged: { ...UNSTAGED, 'camera-orbit': '1.5708rad 0.7854rad auto' },
    })

    expect(angleOf(read)).toEqual({ theta: 90, phi: 45 })
  })

  it('reads the live camera for an orbit it cannot read as two angles', () => {
    const read = reading({
      orbit: { theta: 20, phi: 80 },
      staged: { ...UNSTAGED, 'camera-orbit': 'calc(10deg + 10deg) auto auto' },
    })

    expect(angleOf(read)).toEqual({ theta: 20, phi: 80 })
  })

  it("reads the viewer's own default before the model loads", () => {
    expect(angleOf(reading({ loaded: false, orbit: null }))).toEqual({
      theta: 0,
      phi: 75,
    })
  })
})

describe('orbitStages', () => {
  it('states the orbit and its reach together at the default distance', () => {
    expect(orbitStages(UNSTAGED, { theta: -40, phi: 75 })).toEqual([
      { name: 'camera-orbit', value: '-40deg 75deg auto' },
      { name: 'max-camera-orbit', value: 'auto auto auto' },
    ])
  })

  it('keeps a stated distance and raises the reach to it', () => {
    const staged = { ...UNSTAGED, 'camera-orbit': '0deg 75deg 6m' }

    expect(orbitStages(staged, { theta: 30, phi: 60 })).toEqual([
      { name: 'camera-orbit', value: '30deg 60deg 6m' },
      { name: 'max-camera-orbit', value: 'auto auto 6m' },
    ])
  })

  it('keeps the angles a stated reach limits, a calc among them', () => {
    const staged = {
      ...UNSTAGED,
      'camera-orbit': '0deg 75deg calc(2m + 1m)',
      'max-camera-orbit': 'auto 120deg 9m',
    }

    expect(orbitStages(staged, { theta: 10, phi: 20 })).toEqual([
      { name: 'camera-orbit', value: '10deg 20deg calc(2m + 1m)' },
      { name: 'max-camera-orbit', value: 'auto 120deg calc(2m + 1m)' },
    ])
  })
})

describe('turnOf', () => {
  it('reads roll, pitch, and yaw as Z, X, and Y', () => {
    expect(turnOf('10deg 20deg 30deg')).toEqual({ x: 20, y: 30, z: 10 })
  })

  it('reads no orientation as no turn', () => {
    expect(turnOf(null)).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('turnStage', () => {
  it('states X, Y, and Z as roll, pitch, and yaw', () => {
    expect(turnStage({ x: 20, y: 30, z: 10 })).toEqual({
      name: 'orientation',
      value: '10deg 20deg 30deg',
    })
  })

  it('drops the attribute for no turn', () => {
    expect(turnStage({ x: 0, y: 0, z: 0 })).toEqual({
      name: 'orientation',
      value: null,
    })
  })
})

describe('scaleOf', () => {
  it.each([
    [null, { x: 1, y: 1, z: 1 }],
    ['2', { x: 2, y: 2, z: 2 }],
    ['2 3', { x: 2, y: 3, z: 2 }],
    ['1 2 3', { x: 1, y: 2, z: 3 }],
    ['big', { x: 1, y: 1, z: 1 }],
  ])('reads %j per axis', (stated, axes) => {
    expect(scaleOf(stated)).toEqual(axes)
  })
})

describe('scaledTo', () => {
  it('sizes one axis alone while unlinked', () => {
    expect(scaledTo({ x: 1, y: 2, z: 3 }, 'y', 5, false)).toEqual({
      x: 1,
      y: 5,
      z: 3,
    })
  })

  it("keeps the axes' ratio while linked", () => {
    expect(scaledTo({ x: 1, y: 2, z: 3 }, 'y', 3, true)).toEqual({
      x: 1.5,
      y: 3,
      z: 4.5,
    })
  })

  it.each([0, -2])('holds a size of %d at the smallest', (value) => {
    expect(scaledTo({ x: 1, y: 2, z: 3 }, 'x', value, false).x).toBe(0.01)
  })

  it('holds a linked size where its least axis is at the smallest, the ratio kept', () => {
    expect(scaledTo({ x: 1, y: 2, z: 3 }, 'z', 0, true)).toEqual({
      x: 0.01,
      y: 0.02,
      z: 0.03,
    })
  })

  it('evens every axis stepped from a size of zero while linked', () => {
    expect(scaledTo({ x: 0, y: 1, z: 1 }, 'x', 2, true)).toEqual({
      x: 2,
      y: 2,
      z: 2,
    })
  })
})

describe('isEven', () => {
  it('tells a scale apart on one axis', () => {
    expect(isEven({ x: 1, y: 1, z: 2 })).toBe(false)
    expect(isEven({ x: 2, y: 2, z: 2 })).toBe(true)
  })
})

describe('depthOf', () => {
  const far = { center: { x: 0, y: 0, z: 5 }, size: { x: 1, y: 1, z: 1 } }

  it('reads zero for a model whose center is far from its origin, until a target is stated', () => {
    expect(depthOf(reading({ bounds: far }))).toBe(0)
  })

  it.each([
    ['0m 0m 4m', 1],
    ['auto auto 450cm', 0.5],
    ['auto auto 5200mm', -0.2],
    ['auto 1m auto', 0],
    ['auto auto calc(1m + 1m)', null],
  ])('reads %j from the center', (stated, depth) => {
    const staged = { ...UNSTAGED, 'camera-target': stated }

    expect(depthOf(reading({ bounds: far, staged }))).toBe(depth)
  })
})
