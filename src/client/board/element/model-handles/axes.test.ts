import { describe, expect, it } from 'vitest'

import type { ModelReading } from '@/shared/frame-bridge/model'

import {
  depthOfDrag,
  type Handle,
  handlesFit,
  handlesOf,
  sizeOfDrag,
  turnOfDrag,
} from './axes'
import type { HandleMode } from './store'

/** A drawn model under a camera `theta` around it and level with it, turned as stated. */
function reading(theta = 0, orientation: string | null = null): ModelReading {
  return {
    src: '../assets/phone.glb',
    loaded: true,
    clips: [],
    orbit: { theta, phi: 90 },
    camera: { distance: 3, view: 30 },
    bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
    staged: {
      'camera-orbit': null,
      'min-camera-orbit': null,
      'max-camera-orbit': null,
      'camera-target': null,
      'field-of-view': null,
      'max-field-of-view': null,
      orientation,
      scale: null,
      'animation-name': null,
      autoplay: null,
    },
  }
}

/** One mode's handle for an axis. */
function handle(
  mode: HandleMode,
  axis: Handle['axis'],
  from = reading(),
): Handle {
  const found = handlesOf(mode, from, true).find((each) => each.axis === axis)
  if (!found) throw new Error(`${mode} draws no ${axis}`)
  return found
}

/** A handle's tip in whole pixels, a zero from below read as zero. */
const tip = (found: Handle) => ({
  x: Math.round(found.tip.x) + 0,
  y: Math.round(found.tip.y) + 0,
})

describe('handlesOf', () => {
  it('draws Move along the page and toward the viewer', () => {
    expect(tip(handle('move', 'x'))).toEqual({ x: 50, y: 0 })
    expect(tip(handle('move', 'y'))).toEqual({ x: 0, y: -50 })
    expect(tip(handle('move', 'z'))).toEqual({ x: -29, y: 21 })
  })

  it.each([
    [90, { x: -50, y: 0 }],
    [180, { x: 29, y: -20 }],
    // Over X, so it draws short of X's tip.
    [-90, { x: 24, y: 0 }],
  ])("draws the scene's depth as a camera at %d sees it", (theta, seen) => {
    expect(tip(handle('move', 'z', reading(theta)))).toEqual(seen)
  })

  it("keeps Move's own X and Y to a placed model", () => {
    const axes = handlesOf('move', reading(), false).map(({ axis }) => axis)

    expect(axes).toEqual(['z'])
  })

  it.each([
    [0, { x: 50, y: 0 }],
    [180, { x: -50, y: 0 }],
  ])("draws a model's X through a camera at %d", (theta, seen) => {
    expect(tip(handle('size', 'x', reading(theta)))).toEqual(seen)
  })

  it("draws Size along the turned model's own axes", () => {
    const rolled = reading(0, '90deg 0deg 0deg')

    expect(tip(handle('size', 'x', rolled))).toEqual({ x: 0, y: -50 })
    expect(tip(handle('size', 'y', rolled))).toEqual({ x: -50, y: 0 })
  })

  it('draws Size for a model turned past 90 on one axis the way it faces', () => {
    const about = reading(0, '0deg 0deg 180deg')

    expect(tip(handle('size', 'x', about))).toEqual({ x: -50, y: 0 })
  })

  it('draws Turn about the axes its fields turn', () => {
    const pitched = reading(0, '0deg 90deg 0deg')

    // The viewer turns Y after X, so Y stays upright however the model pitches.
    expect(tip(handle('turn', 'y', pitched))).toEqual({ x: 0, y: -50 })
    expect(tip(handle('turn', 'z', pitched))).toEqual({ x: 0, y: 50 })
  })

  it('keeps a handle seen end on clear of the center', () => {
    for (const theta of [0, 35, 54, 125, 180, 235]) {
      for (const found of handlesOf('size', reading(theta), true)) {
        expect(Math.hypot(found.tip.x, found.tip.y)).toBeGreaterThanOrEqual(
          23.99,
        )
      }
    }
  })
})

describe('handlesOf, at every angle', () => {
  const around = Array.from({ length: 73 }, (_, step) => step * 5 - 180)
  const heights = [15, 45, 75, 90, 105, 150]
  const turns = [
    null,
    '0deg 90deg 0deg',
    '0deg -90deg 0deg',
    '30deg 60deg -120deg',
    '0deg 0deg 35deg',
  ]

  it.each(['move', 'turn', 'size'] as const)(
    'keeps no two %s tips within one press',
    (mode) => {
      const nearest = around.flatMap((theta) =>
        heights.flatMap((phi) =>
          turns.map((orientation) => {
            const from = reading(theta, orientation)
            const tips = handlesOf(
              mode,
              { ...from, orbit: { theta, phi } },
              true,
            ).map((found) => found.tip)
            const gaps = tips.flatMap((one, at) =>
              tips
                .slice(at + 1)
                .map((other) => Math.hypot(one.x - other.x, one.y - other.y)),
            )
            return Math.min(...gaps)
          }),
        ),
      )

      expect(Math.min(...nearest)).toBeGreaterThanOrEqual(24)
    },
  )
})

describe('turnOfDrag', () => {
  it('turns half a degree a pixel across the axis, its face toward the pointer', () => {
    expect(turnOfDrag(handle('turn', 'y'), { x: 60, y: 0 })).toBe(30)
    expect(turnOfDrag(handle('turn', 'x'), { x: 0, y: 60 })).toBe(30)
  })

  it('turns none for a drag along the axis', () => {
    expect(turnOfDrag(handle('turn', 'y'), { x: 0, y: 60 })).toBe(0)
  })

  it('turns the same way on screen whichever side the camera sees', () => {
    const behind = reading(180)

    expect(turnOfDrag(handle('turn', 'y', behind), { x: 60, y: 0 })).toBe(30)
    expect(turnOfDrag(handle('turn', 'x', behind), { x: 0, y: 60 })).toBe(-30)
  })

  it('turns round the tip of an axis pointing at the viewer', () => {
    // Counterclockwise at the lower left is down and to the right.
    expect(turnOfDrag(handle('turn', 'z'), { x: 30, y: 30 })).toBeGreaterThan(0)
  })
})

describe('sizeOfDrag', () => {
  it('doubles for a drag as long as the handle and halves for half of it back', () => {
    expect(sizeOfDrag(handle('size', 'x'), { x: 50, y: 0 })).toBe(2)
    expect(sizeOfDrag(handle('size', 'x'), { x: -25, y: 0 })).toBe(0.5)
  })

  it('takes no size from a drag across the handle', () => {
    expect(sizeOfDrag(handle('size', 'x'), { x: 0, y: 40 })).toBe(1)
  })

  it('stops at zero for a drag past the center', () => {
    expect(sizeOfDrag(handle('size', 'x'), { x: -90, y: 0 })).toBe(0)
  })

  it('grows outward on a model seen from behind', () => {
    const behind = handle('size', 'x', reading(180))

    expect(sizeOfDrag(behind, { x: -50, y: 0 })).toBe(2)
  })
})

describe('depthOfDrag', () => {
  // 2 m tall at the model, so 100 px of box is 2 m.
  const camera = { distance: 1, view: 90 }

  it('follows the pointer where the axis runs across the page', () => {
    const side = handle('move', 'z', reading(90))

    expect(depthOfDrag(side, { x: -50, y: 0 }, camera, 100)).toBe(1)
  })

  it('follows the pointer as far on a handle drawn short', () => {
    const short = handle('move', 'z', reading(-90))

    expect(depthOfDrag(short, { x: 50, y: 0 }, camera, 100)).toBe(1)
  })

  it('comes nearer for a drag along the handle and away for one back', () => {
    const { tip: end } = handle('move', 'z')
    const front = handle('move', 'z')

    expect(depthOfDrag(front, end, camera, 100)).toBe(1)
    expect(depthOfDrag(front, { x: -end.x, y: -end.y }, camera, 100)).toBe(-1)
  })
})

describe('handlesFit', () => {
  it.each([
    [{ width: 177, height: 100 }, true],
    [{ width: 120, height: 68 }, true],
    [{ width: 98, height: 55 }, false],
    [{ width: 40, height: 40 }, false],
    [{ width: 400, height: 12 }, false],
  ])('answers %j', (size, fits) => {
    expect(handlesFit(size, 6)).toBe(fits)
  })
})
