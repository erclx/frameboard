import type { Rotation } from '@/shared/frame-bridge/live-element'

import { type NumberChange, NumberField } from '../number-field'
import {
  DEFAULT_PERSPECTIVE,
  isTilted,
  parseTilt,
  type Tilt,
  type TiltField,
  tiltTransform,
  UNTILTED,
  withField,
} from './tilt-value'
import type { ElementChange, PreviewStyle, WriteElement } from './write'

const DEGREES: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'degree',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
}
const LENGTH: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

/** Why the section is off for an element the tab may otherwise write, or null when it is on. */
function lockOf(rotation: Rotation, tilt: Tilt | null): string | null {
  if (rotation.transform.ruled) {
    return 'A rule sets its transform, which a tilt here would replace.'
  }
  if (!tilt) {
    return 'Its transform is not one this section writes, so edit it in the file.'
  }
  if (isTilted(tilt)) return null
  if (rotation.transform.reanchors) {
    return 'A tilt would move an element anchored above it.'
  }
  if (rotation.degrees === null) {
    return 'A 3D rotate already turns it.'
  }
  if (rotation.degrees !== 0 && rotation.own.rotate !== 0) {
    return 'A rule rotates it, so a tilt would turn it twice.'
  }
  if (rotation.degrees !== 0 && flipOf(rotation.scale) === null) {
    return 'Its scale stretches its turn, so a tilt could not hold the picture.'
  }
  return null
}

/**
 * The sign an own `rotate` takes once carried into Rotate Z, which composes
 * after `scale`: a flip on one axis mirrors the turn, and null for a scale
 * that stretches, which no angle after it can match.
 */
function flipOf(scale: Rotation['scale']): 1 | -1 | null {
  if (!scale || Math.abs(scale.x) !== Math.abs(scale.y)) return null
  return Math.sign(scale.x) === Math.sign(scale.y) ? 1 : -1
}

interface TiltSectionProps {
  rotation: Rotation
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

/**
 * The 3D section, writing the element's own `transform` and never its parent.
 * A first tilt moves an own `rotate` into Rotate Z and drops it in the same
 * write, so the picture holds and one undo restores both.
 */
export function TiltSection({
  rotation,
  disabled,
  write,
  preview,
}: TiltSectionProps) {
  const read = parseTilt(rotation.transform.own)
  const lock = lockOf(rotation, read)
  const off = disabled || lock !== null
  const tilt = read ?? UNTILTED
  const tilted = isTilted(tilt)
  // Only an own `rotate` with no rule under it can be dropped for Rotate Z.
  const carried =
    !tilted && rotation.own.rotate === 0 && rotation.degrees
      ? rotation.degrees * (flipOf(rotation.scale) ?? 1)
      : 0
  const shown: Tilt = { ...tilt, rotateZ: tilt.rotateZ || carried }

  const next = (field: TiltField, value: number): Tilt => {
    const set = withField(tilt, field, value)
    return field === 'rotateZ' || !carried ? set : { ...set, rotateZ: carried }
  }

  const change = (made: Tilt): ElementChange => {
    const transform = { property: 'transform', value: tiltTransform(made) }
    return carried
      ? {
          kind: 'styles',
          declarations: [transform, { property: 'rotate', value: '' }],
        }
      : { kind: 'style', ...transform }
  }

  const field = (key: TiltField) => {
    const from = shown[key] ?? DEFAULT_PERSPECTIVE
    return {
      onPreview: (step: NumberChange | null) => {
        if (carried) preview?.('rotate', step ? '0deg' : null)
        preview?.(
          'transform',
          step ? tiltTransform(next(key, step(from))) || 'none' : null,
        )
      },
      onCommit: (step: NumberChange) => {
        const value = step(from)
        // A value landing where it started writes nothing, so an Enter on an untouched field leaves the file alone.
        if (value === from) return Promise.resolve(false)
        return write(change(next(key, value)))
      },
    }
  }

  return (
    <section
      aria-labelledby="inspector-tilt"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-tilt" className="mb-2 text-xs font-semibold">
        3D
      </h2>
      {lock ? (
        <p className="mb-2 text-caption text-muted-foreground">{lock}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Rotate X"
          caption="Rotate X"
          value={shown.rotateX}
          format={DEGREES}
          disabled={off}
          {...field('rotateX')}
        />
        <NumberField
          label="Rotate Y"
          caption="Rotate Y"
          value={shown.rotateY}
          format={DEGREES}
          disabled={off}
          {...field('rotateY')}
        />
        <NumberField
          className="mt-1.5"
          label="Rotate Z"
          caption="Rotate Z"
          value={shown.rotateZ}
          format={DEGREES}
          disabled={off}
          {...field('rotateZ')}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField
          label="Depth"
          caption="Depth"
          value={shown.depth}
          format={LENGTH}
          disabled={off}
          {...field('depth')}
        />
        <NumberField
          label="Perspective"
          caption="Perspective"
          // A first tilt writes the default, so an untilted element shows it.
          value={tilted ? shown.perspective : DEFAULT_PERSPECTIVE}
          empty="None"
          min={1}
          format={LENGTH}
          // Perspective takes effect only once a rotation or depth is set.
          disabled={off || !tilted}
          {...field('perspective')}
        />
      </div>
    </section>
  )
}
