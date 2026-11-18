import { cn } from '@/client/lib/cn'

interface SwitchRowProps {
  label: string
  /** The accessible name, when the group label already says what `label` leaves out. */
  name?: string
  on: boolean
  disabled: boolean
  onTurn: () => void
  className?: string
}

/** A label with a switch at its row's end, for a boolean attribute a file states or leaves out. */
export function SwitchRow({
  label,
  name,
  on,
  disabled,
  onTurn,
  className,
}: SwitchRowProps) {
  return (
    <label className={cn('flex items-center justify-between gap-2', className)}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        disabled={disabled}
        onClick={onTurn}
        className={cn(
          'relative h-3.5 w-[26px] shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
          on ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-white transition-[left] motion-reduce:transition-none',
            on ? 'left-[14px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}
