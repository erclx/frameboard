import { cn } from 'cn'
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react'

import { Input } from '@/client/components/ui/input'

import { isStrayHistory } from './stray-history'

interface CommitFieldProps {
  label: string
  /** The key letter or icon over the left padding, as the reference's `.k`. */
  prefix?: ReactNode
  /** The stored value as the field shows it. */
  shown: string
  disabled: boolean
  /** Sends the typed value, trimmed, and answers whether it was written. */
  onCommit: (typed: string) => Promise<boolean>
  className?: string
  /** The input's left padding, which clears the prefix, 26px by default for a letter. */
  inset?: string
  inputClassName?: string
}

/**
 * One inspector field that commits on Enter or blur and cancels on Esc. A
 * value it sent stays shown until the stored value moves, so the field never
 * flashes the old value while the frame reloads, and a refused write shows
 * the stored value again.
 */
export function CommitField({
  label,
  prefix,
  shown,
  disabled,
  onCommit,
  className,
  inset = 'pl-[26px]',
  inputClassName,
}: CommitFieldProps) {
  // Null while the field shows the stored value, a string while it is typed in.
  const [draft, setDraft] = useState<string | null>(null)
  // A sent value, held only while the stored value is still the one it was sent over.
  const [sent, setSent] = useState<{ value: string; over: string } | null>(null)
  // Once the stored value moves the sent one is done with, so an undo
  // bringing the old value back never shows it again.
  if (sent && sent.over !== shown) setSent(null)
  const held = sent?.over === shown ? sent.value : null

  // Esc blurs the field to leave it, which must not commit what it cancelled.
  const cancelled = useRef(false)

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft === null) return
    setDraft(null)
    const typed = draft.trim()
    if (typed === shown) return
    setSent({ value: typed, over: shown })
    void onCommit(typed).then((written) => {
      if (!written) setSent(null)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') {
      setDraft(null)
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  return (
    <label className={cn('relative block', className)}>
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 items-center text-xs text-faint"
        >
          {prefix}
        </span>
      ) : null}
      <Input
        aria-label={label}
        className={cn(prefix ? inset : undefined, inputClassName)}
        value={draft ?? held ?? shown}
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          if (isStrayHistory(event)) return
          setDraft(event.currentTarget.value)
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </label>
  )
}
