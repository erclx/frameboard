import { describe, expect, it } from 'vitest'

import type { ModelReading } from '@/shared/frame-bridge/model'

import {
  angleOf,
  fileName,
  orbitStages,
  scaleOf,
  scaleStage,
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
  it('reads one number for a scale even on every axis', () => {
    expect(scaleOf('2 2 2')).toBe(2)
  })

  it('reads no scale as 1', () => {
    expect(scaleOf(null)).toBe(1)
  })

  it('reads null for axes that differ', () => {
    expect(scaleOf('1 2 1')).toBeNull()
  })
})

describe('scaleStage', () => {
  it('states the number on every axis', () => {
    expect(scaleStage(1.5)).toEqual({ name: 'scale', value: '1.5 1.5 1.5' })
  })

  it('drops the attribute at 1', () => {
    expect(scaleStage(1)).toEqual({ name: 'scale', value: null })
  })
})

describe('fileName', () => {
  it('reads the last segment of a link, decoded, with no query', () => {
    expect(fileName('../assets/models/my%20phone.glb?v=2')).toBe('my phone.glb')
  })
})
