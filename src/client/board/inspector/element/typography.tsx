import { cn } from 'cn'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  LetterSpacing,
  LineHeight,
  type LucideIcon,
} from 'lucide-react'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { NumberField } from '../number-field'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const ALIGNS: readonly { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'left', label: 'Align text left', icon: AlignLeft },
  { value: 'center', label: 'Align text center', icon: AlignCenter },
  { value: 'right', label: 'Align text right', icon: AlignRight },
]

/** A computed size can carry a fraction, as `styles.ts` reads it to two places. */
const SIZE: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }
const WEIGHT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

interface TypographySectionProps {
  fontSize: number
  fontWeight: number
  /** In px, null for `normal`, which reads Auto. */
  lineHeight: number | null
  /** In px. */
  letterSpacing: number
  /** The computed alignment, `left`, `center`, or `right` lighting a button. */
  textAlign: string
  disabled: boolean
  write: WriteElement
  /** Shows a step on the live element before it is written. */
  preview?: PreviewStyle
}

/** Browsers draw `normal` near 1.2 times the size, where a step from Auto starts. */
const NORMAL_LINE = 1.2

/**
 * The Typography section of `inspector/text`: size in px, weight stepping
 * by 100, line height and letter spacing in px, and three alignment
 * buttons, each writing one declaration. Every icon control is captioned
 * or names itself in a tooltip. A `normal` line height reads Auto
 * and writes nothing until changed. Family stays the agent's.
 */
export function TypographySection({
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textAlign,
  disabled,
  write,
  preview,
}: TypographySectionProps) {
  return (
    <section
      aria-labelledby="inspector-typography"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-typography" className="mb-2 text-xs font-semibold">
        Typography
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Font size"
          prefix="Size"
          inset="pl-[40px]"
          value={fontSize}
          min={1}
          format={SIZE}
          disabled={disabled}
          {...styleNumber(
            'font-size',
            fontSize,
            (value) => `${value}px`,
            write,
            preview,
          )}
        />
        <NumberField
          label="Font weight"
          prefix="Weight"
          inset="pl-[56px]"
          value={fontWeight}
          step={100}
          min={1}
          max={1000}
          format={WEIGHT}
          disabled={disabled}
          {...styleNumber('font-weight', fontWeight, String, write, preview)}
        />
        <NumberField
          label="Line height"
          caption="Line height"
          prefix={
            <LineHeight aria-hidden className="size-3" strokeWidth={1.6} />
          }
          inset="pl-[28px]"
          value={lineHeight}
          empty="Auto"
          min={0}
          format={SIZE}
          disabled={disabled}
          {...styleNumber(
            'line-height',
            lineHeight ?? Math.round(fontSize * NORMAL_LINE),
            (value) => `${value}px`,
            write,
            preview,
          )}
        />
        <NumberField
          label="Letter spacing"
          caption="Letter spacing"
          prefix={
            <LetterSpacing aria-hidden className="size-3" strokeWidth={1.6} />
          }
          inset="pl-[28px]"
          value={letterSpacing}
          format={SIZE}
          disabled={disabled}
          {...styleNumber(
            'letter-spacing',
            letterSpacing,
            (value) => `${value}px`,
            write,
            preview,
          )}
        />
      </div>
      <p
        id="inspector-alignment"
        className="mt-1.5 mb-1 ml-0.5 text-label font-normal text-muted-foreground"
      >
        Alignment
      </p>
      <div
        role="group"
        aria-labelledby="inspector-alignment"
        className="flex w-max gap-0.5 rounded-md bg-input p-0.5"
      >
        {ALIGNS.map(({ value, label, icon: Icon }) => (
          <ActionTooltip key={value} label={label}>
            <button
              type="button"
              aria-label={label}
              aria-pressed={textAlign === value}
              disabled={disabled}
              onClick={() => {
                if (textAlign !== value) {
                  void write({ kind: 'style', property: 'text-align', value })
                }
              }}
              className={cn(
                'grid h-[22px] w-7 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                textAlign === value && 'bg-sidebar text-foreground',
              )}
            >
              <Icon aria-hidden className="size-[13px]" />
            </button>
          </ActionTooltip>
        ))}
      </div>
    </section>
  )
}
