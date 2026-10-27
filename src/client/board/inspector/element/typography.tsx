import { cn } from 'cn'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  LetterSpacing,
  LineHeight,
  type LucideIcon,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import { NumberField } from '../number-field'
import { faceOf } from './families'
import { weightLabel, weightsOf } from './weights'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const ALIGNS: readonly { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'left', label: 'Align text left', icon: AlignLeft },
  { value: 'center', label: 'Align text center', icon: AlignCenter },
  { value: 'right', label: 'Align text right', icon: AlignRight },
]

/** A computed size can carry a fraction, as `styles.ts` reads it to two places. */
const SIZE: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

interface TypographySectionProps {
  /** The computed stack, whose first family picks the weights offered. */
  fontFamily: string
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
 * The Typography section of `inspector/text`: weight by name among those
 * the face ships, size in px, line height and letter spacing in px, and
 * three alignment buttons, each writing one declaration. Every icon control
 * is captioned or names itself in a tooltip. A `normal` line height reads
 * Auto and writes nothing until changed. Family stays the agent's.
 */
export function TypographySection({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textAlign,
  disabled,
  write,
  preview,
}: TypographySectionProps) {
  const weights = weightsOf(faceOf(fontFamily))
  return (
    <section
      aria-labelledby="inspector-typography"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-typography" className="mb-2 text-xs font-semibold">
        Typography
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        <TypePicker
          label="Font weight"
          shown={weightLabel(fontWeight, weights)}
          current={String(fontWeight)}
          options={weights.map(({ value, name }) => ({
            value: String(value),
            name,
          }))}
          disabled={disabled}
          onPick={(value) =>
            void write({ kind: 'style', property: 'font-weight', value })
          }
        />
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

interface TypeOption {
  value: string
  name: string
  /** The stack the option's row renders in, as a preview of the face. */
  font?: string
}

interface TypePickerProps {
  label: string
  /** What the closed picker reads, which may name a value no option holds. */
  shown: string
  /** The option checked, matched by value. */
  current: string | null
  options: readonly TypeOption[]
  disabled: boolean
  /** Called for an option other than the current one. */
  onPick: (value: string) => void
  className?: string
}

/** A menu of named values with the current one checked, for the family and the weight. */
function TypePicker({
  label,
  shown,
  current,
  options,
  disabled,
  onPick,
  className,
}: TypePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          'flex h-[26px] min-w-0 items-center gap-1 rounded-md bg-input px-2 text-left text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
          className,
        )}
      >
        <span className="flex-1 truncate">{shown}</span>
        <ChevronDown
          aria-hidden
          className="size-2.5 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <ChromeMenuContent
        align="start"
        sideOffset={6}
        className="w-auto min-w-(--anchor-width)"
      >
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value: string) => {
            if (value !== current) onPick(value)
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className={MENU_ROW}
              style={option.font ? { fontFamily: option.font } : undefined}
            >
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </ChromeMenuContent>
    </DropdownMenu>
  )
}
