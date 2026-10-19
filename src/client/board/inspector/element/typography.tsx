import { cn } from 'cn'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  type LucideIcon,
} from 'lucide-react'

import { CommitField } from './field'
import { parseWhole } from './values'
import type { WriteElement } from './write'

const ALIGNS: readonly { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'left', label: 'Align text left', icon: AlignLeft },
  { value: 'center', label: 'Align text center', icon: AlignCenter },
  { value: 'right', label: 'Align text right', icon: AlignRight },
]

interface TypographySectionProps {
  fontSize: number
  fontWeight: number
  /** The computed alignment, `left`, `center`, or `right` lighting a button. */
  textAlign: string
  disabled: boolean
  write: WriteElement
}

/**
 * The Typography section of `inspector/text`: size in px, weight, and three
 * alignment buttons, each writing one declaration. Family, line height, and
 * letter spacing stay the agent's.
 */
export function TypographySection({
  fontSize,
  fontWeight,
  textAlign,
  disabled,
  write,
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
        <CommitField
          label="Font size"
          prefix="Size"
          inset="pl-[40px]"
          shown={String(fontSize)}
          disabled={disabled}
          onCommit={async (typed) => {
            const px = parseWhole(typed, 'px')
            if (px === null || px === 0) return false
            return write({
              kind: 'style',
              property: 'font-size',
              value: `${px}px`,
            })
          }}
        />
        <CommitField
          label="Font weight"
          prefix="Wt"
          inset="pl-[32px]"
          shown={String(fontWeight)}
          disabled={disabled}
          onCommit={async (typed) => {
            const weight = parseWhole(typed, '')
            if (weight === null || weight < 1 || weight > 1000) return false
            return write({
              kind: 'style',
              property: 'font-weight',
              value: String(weight),
            })
          }}
        />
      </div>
      <div className="mt-1.5 flex w-max gap-0.5 rounded-md bg-input p-0.5">
        {ALIGNS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
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
        ))}
      </div>
    </section>
  )
}
