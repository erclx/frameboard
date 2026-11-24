import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'

import { cn } from '@/client/lib/cn'

/** A 24px target drawing the 20px fill the references draw, through `ROW_FILL`. */
const ROW_BUTTON =
  'group/target grid size-6 shrink-0 place-items-center outline-none hover:text-foreground disabled:pointer-events-none'

const ROW_FILL =
  'grid size-5 place-items-center rounded-[5px] group-hover/target:bg-accent group-focus-visible/target:ring-2 group-focus-visible/target:ring-ring/50'

/**
 * A hidden row's name and glyphs, dimmed yet past 4.5:1 on a hovered row,
 * since a hidden row still renames and restacks.
 */
export const HIDDEN_TEXT =
  'text-[color-mix(in_srgb,var(--muted-foreground)_70%,var(--foreground))]'

/** Shown on the row's hover or focus alone, for a flag that is off. */
const ON_HOVER =
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

interface RowFlagsProps {
  /** The row's name, which each button's label ends on. */
  name: string
  hidden: boolean
  locked: boolean
  canWrite: boolean
  onHide: (hidden: boolean) => void
  onLock: (locked: boolean) => void
}

/**
 * A layers row's eye and lock, each drawn while its flag is on and otherwise
 * on the hover or focus of the `group` around them.
 */
export function RowFlags({
  name,
  hidden,
  locked,
  canWrite,
  onHide,
  onLock,
}: RowFlagsProps) {
  return (
    <>
      <button
        type="button"
        aria-label={`${hidden ? 'Show' : 'Hide'} ${name}`}
        aria-pressed={hidden}
        disabled={!canWrite}
        onClick={() => onHide(!hidden)}
        className={cn(
          ROW_BUTTON,
          hidden ? HIDDEN_TEXT : cn('text-muted-foreground', ON_HOVER),
        )}
      >
        <span className={ROW_FILL}>
          {hidden ? (
            <EyeOff aria-hidden className="size-[13px]" />
          ) : (
            <Eye aria-hidden className="size-[13px]" />
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={`${locked ? 'Unlock' : 'Lock'} ${name}`}
        aria-pressed={locked}
        disabled={!canWrite}
        onClick={() => onLock(!locked)}
        className={cn(ROW_BUTTON, 'text-muted-foreground', !locked && ON_HOVER)}
      >
        <span className={ROW_FILL}>
          {locked ? (
            <Lock aria-hidden className="size-[13px]" />
          ) : (
            <LockOpen aria-hidden className="size-[13px]" />
          )}
        </span>
      </button>
    </>
  )
}
