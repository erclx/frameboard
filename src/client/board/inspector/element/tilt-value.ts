/** The five values the 3D section edits, read off and written into one `transform`. */
export interface Tilt {
  /** In px, null where the transform states none, so the element tilts flat. */
  perspective: number | null
  /** The `translateZ()` in px, toward the viewer when positive. */
  depth: number
  /** Each in degrees. */
  rotateX: number
  rotateY: number
  rotateZ: number
}

export type TiltField = keyof Tilt

/** The perspective a first tilt writes, the value the picked frame shows. */
export const DEFAULT_PERSPECTIVE = 800

export const UNTILTED: Tilt = {
  perspective: null,
  depth: 0,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
}

/**
 * The fixed order the section writes, depth moving the element toward the
 * viewer before it turns, and the only order it reads back.
 */
const ORDER = [
  { name: 'perspective', field: 'perspective', unit: 'px' },
  { name: 'translatez', field: 'depth', unit: 'px' },
  { name: 'rotatex', field: 'rotateX', unit: 'deg' },
  { name: 'rotatey', field: 'rotateY', unit: 'deg' },
  { name: 'rotatez', field: 'rotateZ', unit: 'deg' },
] as const

const SPELLED: Record<(typeof ORDER)[number]['name'], string> = {
  perspective: 'perspective',
  translatez: 'translateZ',
  rotatex: 'rotateX',
  rotatey: 'rotateY',
  rotatez: 'rotateZ',
}

const FUNCTION =
  /^([a-z]+)\(\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]*)\s*\)$/i

/**
 * An element's own `transform` as the five values, `UNTILTED` for none, or
 * null for any transform the section did not write, such as a `translate()`,
 * a `matrix()`, another unit, or its functions in another order.
 */
export function parseTilt(transform: string): Tilt | null {
  const text = transform.trim()
  if (text === '' || text === 'none') return { ...UNTILTED }
  const tilt: Tilt = { ...UNTILTED }
  let next = 0
  for (const part of text.split(/\s+(?![^(]*\))/)) {
    const call = FUNCTION.exec(part)
    if (!call?.[1] || call[2] === undefined) return null
    const name = call[1].toLowerCase()
    const at = ORDER.findIndex((entry) => entry.name === name)
    const entry = ORDER[at]
    if (!entry || at < next) return null
    next = at + 1
    const value = Number(call[2])
    const unit = call[3]?.toLowerCase() ?? ''
    if (unit !== entry.unit && !(unit === '' && value === 0)) return null
    if (entry.field === 'perspective') {
      if (value <= 0) return null
      tilt.perspective = value
    } else {
      tilt[entry.field] = value
    }
  }
  return tilt
}

/** Whether a rotation or depth is not zero, which is when a perspective takes effect. */
export function isTilted(tilt: Tilt): boolean {
  return (
    tilt.depth !== 0 ||
    tilt.rotateX !== 0 ||
    tilt.rotateY !== 0 ||
    tilt.rotateZ !== 0
  )
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The `transform` writing `tilt` in the fixed order with each zero left out,
 * or empty to drop the declaration where nothing tilts.
 */
export function tiltTransform(tilt: Tilt): string {
  if (!isTilted(tilt)) return ''
  return ORDER.flatMap(({ name, field, unit }) => {
    const value = tilt[field]
    if (value === null || (field !== 'perspective' && value === 0)) return []
    return [`${SPELLED[name]}(${rounded(value)}${unit})`]
  }).join(' ')
}

/**
 * `tilt` with one field set, taking the default perspective on a first tilt
 * where none is stated, so the turn reads as depth rather than a squash.
 */
export function withField(tilt: Tilt, field: TiltField, value: number): Tilt {
  const next: Tilt = { ...tilt, [field]: value }
  if (field !== 'perspective' && !isTilted(tilt) && tilt.perspective === null) {
    next.perspective = DEFAULT_PERSPECTIVE
  }
  return next
}
