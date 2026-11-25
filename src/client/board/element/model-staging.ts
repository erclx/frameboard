import {
  type Axes,
  type ModelReading,
  type ModelStage,
  type ModelTransform,
  stagedTerms,
} from '@/shared/frame-bridge/model'

/** In degrees, `theta` across and `phi` down from the top. */
export interface Angle {
  theta: number
  phi: number
}

export type Turn = Axes

/** The orbit a viewer takes with none stated, from its `DEFAULT_CAMERA_ORBIT`. */
const DEFAULT_ANGLE: Angle = { theta: 0, phi: 75 }

/** A term as degrees, a bare number being radians as the viewer reads one, or null for any other. */
function degreesOf(term: string | undefined): number | null {
  const read = /^(-?\d*\.?\d+)(deg|rad)?$/.exec(term ?? '')
  if (!read?.[1]) return null
  const number = Number(read[1])
  return read[2] === 'deg' ? number : Math.round((number * 180) / Math.PI)
}

/**
 * The angle the file states, else the live camera's, which also answers an
 * orbit stated as `auto` or a `calc()`.
 */
export function angleOf({ staged, orbit }: ModelReading): Angle {
  const [theta, phi] = stagedTerms(staged['camera-orbit']).map(degreesOf)
  if (typeof theta === 'number' && typeof phi === 'number') {
    return { theta, phi }
  }
  return orbit ?? DEFAULT_ANGLE
}

/**
 * The two attributes an angle is written as. The viewer holds a camera
 * inside `max-camera-orbit`, so the reach takes the orbit's own distance and
 * a distance the file states always shows.
 */
export function orbitStages(
  staged: ModelReading['staged'],
  { theta, phi }: Angle,
): ModelStage[] {
  const radius = stagedTerms(staged['camera-orbit'])[2] ?? 'auto'
  const [maxTheta = 'auto', maxPhi = 'auto'] = stagedTerms(
    staged['max-camera-orbit'],
  )
  return [
    { name: 'camera-orbit', value: `${theta}deg ${phi}deg ${radius}` },
    { name: 'max-camera-orbit', value: `${maxTheta} ${maxPhi} ${radius}` },
  ]
}

/** A stated `orientation` as its turn about each axis, the viewer's roll, pitch, and yaw being Z, X, and Y. */
export function turnOf(orientation: string | null): Turn {
  const [roll, pitch, yaw] = stagedTerms(orientation).map(degreesOf)
  return { x: pitch ?? 0, y: yaw ?? 0, z: roll ?? 0 }
}

export function turnStage({ x, y, z }: Turn): ModelStage {
  const turned = x !== 0 || y !== 0 || z !== 0
  return {
    name: 'orientation',
    value: turned ? `${z}deg ${x}deg ${y}deg` : null,
  }
}

/** The smallest size an axis takes, since a viewer draws nothing at zero and turns a negative one inside out. */
export const SCALE_MIN = 0.01

/** A value at four decimals, past what a field shows and short of a drag's float noise. */
const rounded = (value: number) => Number(value.toFixed(4))

/** A stated `scale` per axis, one term naming every axis and a missing one taking the first. */
export function scaleOf(scale: string | null): Axes {
  const [x = 1, y = x, z = x] = stagedTerms(scale).map(Number)
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : { x: 1, y: 1, z: 1 }
}

export function isEven({ x, y, z }: Axes): boolean {
  return x === y && y === z
}

/**
 * A scale with one axis at `value`, held at the smallest size, a linked one
 * carrying the other axes by the same ratio.
 */
export function scaledTo(
  from: Axes,
  axis: keyof Axes,
  value: number,
  linked: boolean,
): Axes {
  const held = Math.max(SCALE_MIN, value)
  if (!linked) return { ...from, [axis]: rounded(held) }
  const { x, y, z } = from
  // An axis at zero has no ratio to carry the others by.
  if (from[axis] === 0) return { x: held, y: held, z: held }
  const least = Math.min(...[x, y, z].map(Math.abs).filter((size) => size > 0))
  const ratio = Math.max(Math.abs(held / from[axis]), SCALE_MIN / least)
  return { x: rounded(x * ratio), y: rounded(y * ratio), z: rounded(z * ratio) }
}

/**
 * How many meters nearer than its center a model stands: zero for a target
 * left to the viewer, and null for one stated as no length this reads.
 */
export function depthOf({ staged, bounds }: ModelReading): number | null {
  const term = stagedTerms(staged['camera-target'])[2] ?? 'auto'
  if (term === 'auto') return 0
  const read = /^(-?\d*\.?\d+)(m|cm|mm)?$/.exec(term)
  if (!read?.[1] || !bounds) return null
  const per = read[2] === 'cm' ? 0.01 : read[2] === 'mm' ? 0.001 : 1
  return rounded(bounds.center.z - Number(read[1]) * per)
}

export function transformOf(reading: ModelReading): ModelTransform {
  return { scale: scaleOf(reading.staged.scale), depth: depthOf(reading) }
}
