import { NumberField as Primitive } from '@base-ui/react/number-field'
import { cn } from 'cn'
import {
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react'

import { isStrayHistory } from './element/stray-history'

/** Maps each stored value to the one a gesture asks for, so several frames can move by one step from their own values. */
export type NumberChange = (from: number) => number

interface NumberFieldProps {
  label: string
  /** The key letter or icon over the left padding, which scrubs the value when dragged. */
  prefix?: ReactNode
  /** The input's left padding, which clears the prefix, 26px by default for a letter. */
  inset?: string
  className?: string
  inputClassName?: string
  /** The stored value, null where the selection's values differ, which reads `Mixed`. */
  value: number | null
  /** What an arrow press or a scrub step moves by, and ten times it with Shift. */
  step?: number
  min?: number
  max?: number
  format?: Intl.NumberFormatOptions
  disabled: boolean
  /** Shows a gesture's value before it is written, or puts the stored value back on null. */
  onPreview?: (change: NumberChange | null) => void
  /** Writes a gesture's value, answering false when it was not written. */
  onCommit: (change: NumberChange) => Promise<boolean> | void
}

/**
 * A value the field holds apart from the stored one. On a `Mixed` field a
 * step holds an offset each stored value moves by, and typing holds a value
 * they all take.
 */
interface Draft {
  value: number | null
  offset: boolean
}

const STEP_KEYS = new Set(['ArrowUp', 'ArrowDown'])

/**
 * One inspector number on base-ui's `NumberField`. ArrowUp and ArrowDown step
 * it, Shift by ten, and dragging the prefix scrubs it, each previewing as it
 * goes and writing once, on the arrow's keyup or the scrub's release. A typed
 * value writes on Enter or blur, and Esc puts the stored value back and
 * writes nothing.
 *
 * base-ui commits a keyboard step with every press, so the field steps on
 * its own keys rather than base-ui's, and takes base-ui's commit only for a
 * scrub release. A value it sent stays shown until the stored value moves,
 * as `CommitField` holds one.
 */
export function NumberField({
  label,
  prefix,
  inset = 'pl-[26px]',
  className,
  inputClassName,
  value,
  step = 1,
  min,
  max,
  format,
  disabled,
  onPreview,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraftState] = useState<Draft | null>(null)
  // Read by the keyup and blur that follow a press in the same task, before a render.
  const latest = useRef<Draft | null>(null)
  const [sent, setSent] = useState<{ value: number; over: number } | null>(null)
  if (sent && sent.over !== value) setSent(null)
  const held = sent?.over === value ? sent.value : null
  // The value a gesture started from, since a preview the caller draws may
  // move the stored value under it, as a frame's pending box does.
  const started = useRef<number | null>(null)
  const setDraft = (next: Draft | null) => {
    if (!latest.current && next) started.current = held ?? value
    latest.current = next
    setDraftState(next)
  }

  const scrubbing = useRef(false)
  // Esc during a scrub drops the moves left before the release.
  const scrubCancelled = useRef(false)
  // Esc blurs the field to leave it, which must not commit what it cancelled.
  const cancelled = useRef(false)

  const clamp = (next: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
  const changeOf = ({
    value: next,
    offset,
  }: {
    value: number
    offset: boolean
  }) => (offset ? (from: number) => clamp(from + next) : () => clamp(next))

  const preview = (next: Draft) => {
    if (next.value === null) return
    onPreview?.(changeOf({ value: next.value, offset: next.offset }))
  }

  const cancel = () => {
    if (latest.current) onPreview?.(null)
    setDraft(null)
    if (scrubbing.current) scrubCancelled.current = true
  }

  const commit = () => {
    const current = latest.current
    if (!current) return
    setDraft(null)
    const unchanged = current.offset
      ? current.value === 0
      : current.value === started.current
    if (current.value === null || unchanged) {
      onPreview?.(null)
      return
    }
    const change = changeOf({ value: current.value, offset: current.offset })
    if (value !== null && !current.offset) {
      setSent({ value: clamp(current.value), over: value })
    }
    void Promise.resolve(onCommit(change)).then((written) => {
      if (written !== false) return
      setSent(null)
      onPreview?.(null)
    })
  }

  const stepBy = (event: KeyboardEvent<HTMLInputElement>) => {
    const amount =
      (event.shiftKey ? step * 10 : step) * (event.key === 'ArrowUp' ? 1 : -1)
    const current = latest.current
    // A press after a write steps from the value it sent, which the frame has not reloaded yet.
    const from = held ?? value
    const next: Draft =
      current?.value != null
        ? {
            offset: current.offset,
            value: current.offset
              ? current.value + amount
              : clamp(current.value + amount),
          }
        : from === null
          ? { offset: true, value: amount }
          : { offset: false, value: clamp(from + amount) }
    setDraft(next)
    preview(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (STEP_KEYS.has(event.key)) {
      // Stops base-ui's own step, which commits on every press, and the board's nudge.
      event.preventDefault()
      event.stopPropagation()
      stepBy(event)
    }
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') {
      cancel()
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  // Grouping would show a 1440 px frame as 1,440, which reads as two numbers.
  const shownFormat = useMemo<Intl.NumberFormatOptions>(
    () => ({
      useGrouping: false,
      ...format,
      ...(draft?.offset ? { signDisplay: 'exceptZero' } : {}),
    }),
    [draft?.offset, format],
  )

  return (
    <Primitive.Root
      className={cn('relative block', className)}
      value={draft ? draft.value : (held ?? value)}
      step={step}
      largeStep={step * 10}
      min={min}
      max={max}
      format={shownFormat}
      disabled={disabled}
      onValueChange={(next, details) => {
        if (details.reason === 'scrub') {
          if (scrubCancelled.current) return
          const offset = value === null
          const scrubbed = { value: next, offset }
          setDraft(scrubbed)
          preview(scrubbed)
          return
        }
        if (
          details.reason === 'input-change' ||
          details.reason === 'input-clear' ||
          details.reason === 'input-paste'
        ) {
          setDraft({ value: next, offset: false })
        }
      }}
      onValueCommitted={(_next, details) => {
        if (details.reason !== 'scrub') return
        scrubbing.current = false
        if (scrubCancelled.current) {
          scrubCancelled.current = false
          return
        }
        commit()
      }}
    >
      {prefix ? (
        <Primitive.ScrubArea
          aria-hidden
          className="absolute top-1/2 left-2 flex -translate-y-1/2 cursor-ew-resize items-center text-xs text-faint select-none"
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return
            scrubbing.current = true
            scrubCancelled.current = false
            // A Mixed field scrubs an offset from zero, since base-ui seeds an empty one at zero.
            if (value === null && !latest.current) {
              setDraft({ value: 0, offset: true })
            }
          }}
        >
          {prefix}
        </Primitive.ScrubArea>
      ) : null}
      <Primitive.Input
        aria-label={label}
        placeholder={value === null ? 'Mixed' : undefined}
        className={cn(
          'h-[26px] w-full min-w-0 rounded-md border-0 bg-input px-2 text-xs text-foreground tabular-nums outline-none placeholder:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          prefix ? inset : undefined,
          inputClassName,
        )}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          if (isStrayHistory(event)) event.preventBaseUIHandler()
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (STEP_KEYS.has(event.key)) commit()
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false
            return
          }
          commit()
        }}
      />
    </Primitive.Root>
  )
}
