import { Circle, Square } from 'lucide-react'

import { NumberField } from '../number-field'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

interface AppearanceSectionProps {
  /** From 0 to 1, as the browser computed it. */
  opacity: number
  /** The corner radius in px. */
  radius: number
  disabled: boolean
  write: WriteElement
  /** Shows a step on the live element before it is written. */
  preview?: PreviewStyle
}

/**
 * The Appearance section of `inspector/text`: the opacity as a percent and
 * the corner radius in px, each stepping and scrubbing. The layer name is
 * renamed in Layers rather than here.
 */
export function AppearanceSection({
  opacity,
  radius,
  disabled,
  write,
  preview,
}: AppearanceSectionProps) {
  const percent = Math.round(opacity * 100)
  return (
    <section
      aria-labelledby="inspector-appearance"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-appearance" className="mb-2 text-xs font-semibold">
        Appearance
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Opacity"
          prefix={<Circle className="size-1.5 fill-current" />}
          value={percent}
          min={0}
          max={100}
          format={PERCENT}
          disabled={disabled}
          {...styleNumber(
            'opacity',
            percent,
            (value) => String(value / 100),
            write,
            preview,
          )}
        />
        <NumberField
          label="Corner radius"
          prefix={<Square className="size-3" />}
          value={radius}
          min={0}
          format={WHOLE}
          disabled={disabled}
          {...styleNumber(
            'border-radius',
            radius,
            (value) => `${value}px`,
            write,
            preview,
          )}
        />
      </div>
    </section>
  )
}
