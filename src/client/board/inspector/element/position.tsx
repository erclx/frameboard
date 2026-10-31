import { cn } from 'cn'

import { ActionTooltip } from '../../chrome/action-tooltip'
import type { FreeSpot } from '../../place/write'
import { NumberField } from '../number-field'
import type { Placement } from './styles'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

const FREE_TIP = 'Free positions it inside its parent'

interface PositionSectionProps {
  placement: Placement
  disabled: boolean
  /** Writes an offset of a placed element, as any other declaration. */
  write: WriteElement
  /** Shows a step on the live element before it is written. */
  preview?: PreviewStyle
  /** Places the element at a spot, or back in the flow on null, as one step. */
  place: (spot: FreeSpot | null) => Promise<boolean>
}

/**
 * The Position section of `inspector/position`: an In flow and Free toggle
 * in the header, and while Free, the `left` and `top` the element holds as
 * X and Y, each stepping and scrubbing, as `inspector/position-flow` hides
 * them in the flow. Free places it where it renders, at the size it renders
 * at, counted from its parent.
 */
export function PositionSection({
  placement,
  disabled,
  write,
  preview,
  place,
}: PositionSectionProps) {
  const { free, left, top, width, height } = placement
  const choose = (next: boolean) => {
    if (next === free) return
    void place(
      next
        ? {
            left,
            top,
            ...(width === null ? {} : { width }),
            ...(height === null ? {} : { height }),
          }
        : null,
    )
  }
  const options = [
    { label: 'In flow', on: !free, value: false },
    { label: 'Free', on: free, value: true },
  ]
  return (
    <section
      aria-labelledby="inspector-position"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div
        className={cn(
          'flex items-center justify-between',
          free ? 'mb-2' : undefined,
        )}
      >
        <h2 id="inspector-position" className="text-xs font-semibold">
          Position
        </h2>
        <div
          role="group"
          aria-label="Placement"
          className="flex gap-0.5 rounded-md bg-input p-0.5"
        >
          {options.map(({ label, on, value }) => {
            const button = (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => choose(value)}
                className={cn(
                  'flex h-5 items-center rounded-[5px] px-2 text-[11px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                  on && 'bg-sidebar text-foreground shadow-xs',
                )}
              >
                {label}
              </button>
            )
            return value ? (
              <ActionTooltip key={label} label={FREE_TIP} side="bottom">
                {button}
              </ActionTooltip>
            ) : (
              button
            )
          })}
        </div>
      </div>
      {free ? (
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField
            prefix="X"
            label="X position in its parent"
            value={left}
            format={WHOLE}
            disabled={disabled}
            {...styleNumber(
              'left',
              left,
              (value) => `${value}px`,
              write,
              preview,
            )}
          />
          <NumberField
            prefix="Y"
            label="Y position in its parent"
            value={top}
            format={WHOLE}
            disabled={disabled}
            {...styleNumber(
              'top',
              top,
              (value) => `${value}px`,
              write,
              preview,
            )}
          />
        </div>
      ) : null}
    </section>
  )
}
