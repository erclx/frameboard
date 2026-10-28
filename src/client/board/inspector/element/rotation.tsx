import { cn } from 'cn'
import {
  FlipHorizontal2,
  FlipVertical2,
  type LucideIcon,
  RotateCw,
} from 'lucide-react'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { NumberField } from '../number-field'
import type { Rotation } from './styles'
import type { PreviewStyle, WriteElement } from './write'

const DEGREES: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'degree',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
}

/** An angle in degrees as the field shows it, in (-180, 180]. */
function normalized(degrees: number): number {
  const turn = ((degrees % 360) + 360) % 360
  return Math.round((turn > 180 ? turn - 360 : turn) * 100) / 100
}

/**
 * The `rotate` value writing `degrees`, empty to drop the element's own
 * declaration at 0 rather than write `0deg`. Without one of its own, 0 is
 * written, since only a rule can have turned it.
 */
function rotateValue(degrees: number, inline: boolean): string {
  return degrees === 0 && inline ? '' : `${degrees}deg`
}

/**
 * The `scale` value flipping `scale` along `axis`, as an x and y pair so a
 * rule's uniform scale survives the flip. A flip back to 1 and 1 drops the
 * element's own declaration, and without one writes it, over a rule's.
 */
function flippedScale(
  scale: { x: number; y: number },
  axis: 'x' | 'y',
  inline: boolean,
): string {
  const x = axis === 'x' ? -scale.x : scale.x
  const y = axis === 'y' ? -scale.y : scale.y
  return x === 1 && y === 1 && inline ? '' : `${x} ${y}`
}

function AngleIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M3 11a10 10 0 0 1 10 10" />
    </svg>
  )
}

/** Why the row is off for an element the tab may otherwise write, or null when it is on. */
function lockOf({ degrees, scale, translated }: Rotation): string | null {
  if (translated) {
    return 'Its transform moves it, so a rotation would swing it away'
  }
  if (degrees === null || scale === null) {
    return 'A 3D rotate or scale has no rotation here'
  }
  return null
}

interface RotationRowProps {
  rotation: Rotation
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

/**
 * The Rotation row of `inspector/text`: the `rotate` property in clockwise
 * degrees, then Rotate 90°, Flip horizontal, and Flip vertical, the flips
 * writing `scale`. Neither touches the element's `transform`. The row is
 * off where that transform moves the element, since `rotate` composes ahead
 * of it, and for a 3D value, each saying why.
 */
export function RotationRow({
  rotation,
  disabled,
  write,
  preview,
}: RotationRowProps) {
  const { degrees, scale, inline } = rotation
  const lock = lockOf(rotation)
  const off = disabled || lock !== null
  const current = degrees ?? 0
  const writeRotate = (next: number) =>
    write({
      kind: 'style',
      property: 'rotate',
      value: rotateValue(next, inline.rotate),
    })
  const buttons: readonly {
    label: string
    icon: LucideIcon
    press: () => void
  }[] = [
    {
      label: 'Rotate 90°',
      icon: RotateCw,
      press: () => void writeRotate(normalized(current + 90)),
    },
    ...(['x', 'y'] as const).map((axis) => ({
      label: axis === 'x' ? 'Flip horizontal' : 'Flip vertical',
      icon: axis === 'x' ? FlipHorizontal2 : FlipVertical2,
      press: () =>
        void write({
          kind: 'style',
          property: 'scale',
          value: flippedScale(scale ?? { x: 1, y: 1 }, axis, inline.scale),
        }),
    })),
  ]

  return (
    <>
      {lock ? (
        <span id="inspector-rotation-lock" className="sr-only">
          {lock}
        </span>
      ) : null}
      <div className="mt-1.5 grid grid-cols-2 items-end gap-1.5">
        <NumberField
          label="Rotation"
          caption="Rotation"
          prefix={<AngleIcon />}
          inset="pl-[28px]"
          value={degrees}
          empty="3D"
          format={DEGREES}
          disabled={off}
          onPreview={(change) =>
            preview?.('rotate', change ? `${change(current)}deg` : null)
          }
          onCommit={(change) => {
            const next = normalized(change(current))
            // A typed turn landing where it started writes nothing, and the field shows the stored angle again.
            if (next === current) return Promise.resolve(false)
            return writeRotate(next)
          }}
        />
        <div
          role="group"
          aria-label="Rotate and flip"
          className="grid grid-cols-3 gap-0.5 rounded-md bg-input p-0.5"
        >
          {buttons.map(({ label, icon: Icon, press }) => (
            <ActionTooltip key={label} label={lock ?? label}>
              <button
                type="button"
                aria-label={label}
                aria-describedby={lock ? 'inspector-rotation-lock' : undefined}
                // A locked button stays focusable, so its tooltip can say why.
                aria-disabled={lock !== null || undefined}
                disabled={disabled}
                onClick={() => {
                  if (!off) press()
                }}
                className={cn(
                  'grid h-[22px] place-items-center rounded-[5px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                  off ? 'opacity-50' : 'hover:text-foreground',
                )}
              >
                <Icon aria-hidden className="size-[13px]" />
              </button>
            </ActionTooltip>
          ))}
        </div>
      </div>
    </>
  )
}
