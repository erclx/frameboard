import { ChevronDown } from 'lucide-react'

import type { Listener } from '@/shared/records/notes'

/** The `N listening` line in a note's header, its dot in the agent purple. */
export function ListeningCount({
  listeners,
}: {
  listeners: readonly Listener[]
}) {
  return (
    <span className="ml-auto flex items-center gap-1.5 font-normal text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-claim" />
      {listeners.length === 0
        ? 'No session listening'
        : `${listeners.length} listening`}
    </span>
  )
}

interface SessionPickerProps {
  listeners: readonly Listener[]
  /** The picked session id, or empty for none yet. */
  value: string
  onChange: (session: string) => void
  disabled?: boolean
}

/**
 * The chip picking which listening session a note goes to. The only
 * listener is picked for the developer, and several wait on a pick.
 */
export function SessionPicker({
  listeners,
  value,
  onChange,
  disabled,
}: SessionPickerProps) {
  const none = listeners.length === 0
  return (
    <label className="relative flex h-[26px] min-w-0 items-center gap-1.5 rounded-md bg-muted pr-6 pl-2 text-foreground has-[select:disabled]:opacity-60 has-[select:focus-visible]:ring-3 has-[select:focus-visible]:ring-ring/50">
      <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-claim" />
      <span className="sr-only">Send to</span>
      <select
        value={value}
        disabled={disabled || none}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 appearance-none truncate bg-transparent outline-none disabled:cursor-not-allowed"
      >
        {none ? <option value="">No session</option> : null}
        {!none && listeners.length > 1 ? (
          <option value="" disabled>
            Pick a session
          </option>
        ) : null}
        {listeners.map((listener) => (
          <option key={listener.session} value={listener.session}>
            {listener.tag}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 size-2.5 text-muted-foreground"
      />
    </label>
  )
}
