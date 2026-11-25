import {
  type ModelReading,
  type ModelStage,
  stagedTerms,
} from '@/shared/frame-bridge/model'

/** The camera's place around a model in degrees, `theta` across and `phi` down from the top. */
export interface Angle {
  theta: number
  phi: number
}

/** A model's own rotation about each axis, in degrees. */
export interface Turn {
  x: number
  y: number
  z: number
}

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
 * The angle the Model section shows: the one the file states, else the live
 * camera's, which also answers an orbit stated as `auto` or a `calc()`.
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

/** A stated `scale` as one number, 1 for none and null for axes that differ. */
export function scaleOf(scale: string | null): number | null {
  const [x = 1, y = x, z = x] = stagedTerms(scale).map(Number)
  return x === y && y === z && Number.isFinite(x) ? x : null
}

export function scaleStage(scale: number): ModelStage {
  return {
    name: 'scale',
    value: scale === 1 ? null : `${scale} ${scale} ${scale}`,
  }
}

/** The file a viewer's `src` names, as the section's header shows it. */
export function fileName(src: string): string {
  const last = src.split(/[?#]/)[0]?.split('/').at(-1) ?? ''
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
