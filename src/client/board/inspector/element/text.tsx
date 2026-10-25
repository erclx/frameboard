import { type KeyboardEvent, useRef, useState } from 'react'

import { Kbd } from '@/client/components/ui/kbd'
import { Textarea } from '@/client/components/ui/textarea'

import { isStrayHistory } from './stray-history'
import type { WriteElement } from './write'

/** A pasted line break, in any platform's form. */
const NEWLINES = /\r\n|\r|\n/g

interface TextSectionProps {
  text: string
  disabled: boolean
  write: WriteElement
}

/**
 * Text, for an element holding text alone: a text area applying on Enter or
 * blur and cancelling on Esc, with the keys hinted while it has focus. Text
 * is one line, since a `<br>` would end the text-only state that shows this
 * field, so a newline, typed with Shift or pasted, becomes a space. The
 * written text stays shown until the frame reloads with it.
 */
export function TextSection({ text, disabled, write }: TextSectionProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [sent, setSent] = useState<{ value: string; over: string } | null>(null)
  if (sent && sent.over !== text) setSent(null)
  const held = sent?.over === text ? sent.value : null

  const [focused, setFocused] = useState(false)
  // Esc blurs the field to leave it, which must not commit what it cancelled.
  const cancelled = useRef(false)

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft === null) return
    setDraft(null)
    if (draft === text) return
    setSent({ value: draft, over: text })
    void write({ kind: 'text', value: draft }).then((written) => {
      if (!written) setSent(null)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!event.shiftKey) commit()
    }
    if (event.key === 'Escape') {
      setDraft(null)
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  return (
    <section
      aria-labelledby="inspector-text"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-text" className="mb-2 text-xs font-semibold">
        Text
      </h2>
      <Textarea
        aria-labelledby="inspector-text"
        value={draft ?? held ?? text}
        disabled={disabled}
        onChange={(event) => {
          if (isStrayHistory(event)) return
          setDraft(event.currentTarget.value.replace(NEWLINES, ' '))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={onKeyDown}
        className="max-h-28 min-h-11 resize-none overflow-y-auto rounded-md border-0 bg-input px-2 py-1.5 text-xs leading-[1.4] md:text-xs dark:bg-input"
      />
      {focused ? (
        <p className="mt-1.5 flex items-center gap-1 text-label font-normal text-muted-foreground">
          <Kbd>Enter</Kbd> to apply, <Kbd>Esc</Kbd> to cancel
        </p>
      ) : null}
    </section>
  )
}
