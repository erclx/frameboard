import { NumberField } from '../number-field'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

function OpacityIcon() {
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
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  )
}

function RadiusIcon() {
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
      <path d="M4 20V10a6 6 0 0 1 6-6h10" />
    </svg>
  )
}

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
 * the corner radius in px, each captioned, stepping, and scrubbing. The layer name is
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
          caption="Opacity"
          prefix={<OpacityIcon />}
          inset="pl-[28px]"
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
          caption="Corner radius"
          prefix={<RadiusIcon />}
          inset="pl-[28px]"
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
