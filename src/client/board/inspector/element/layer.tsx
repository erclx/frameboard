import { Circle, Square } from 'lucide-react'

import { NumberField } from '../number-field'
import { CommitField } from './field'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

interface LayerSectionProps {
  /** The layer name, being `data-name` or the one the tree derives. */
  name: string
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
 * The Element section of `inspector/text`: the layer name, written as
 * `data-name`, the opacity as a percent, and the corner radius in px, the
 * two numbers stepping and scrubbing. An empty name writes `data-name`
 * empty, so the layer falls back to its derived name.
 */
export function LayerSection({
  name,
  opacity,
  radius,
  disabled,
  write,
  preview,
}: LayerSectionProps) {
  const percent = Math.round(opacity * 100)
  return (
    <section
      aria-labelledby="inspector-element"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-element" className="mb-2 text-xs font-semibold">
        Element
      </h2>
      <CommitField
        label="Name"
        className="mb-1.5"
        shown={name}
        disabled={disabled}
        onCommit={(typed) =>
          write({ kind: 'attribute', name: 'data-name', value: typed })
        }
      />
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Opacity"
          prefix={<Circle className="size-1.5 fill-current" />}
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
          prefix={<Square className="size-3" />}
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
