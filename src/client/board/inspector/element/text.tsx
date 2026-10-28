import { cn } from 'cn'
import { type KeyboardEvent, useRef, useState } from 'react'

import { Kbd } from '@/client/components/ui/kbd'
import { Textarea } from '@/client/components/ui/textarea'

import type { ElementKey } from '../../selection'
import { isStrayHistory } from './stray-history'
import { forgetText, keptText, type WriteElement } from './write'

/** A pasted line break, in any platform's form. */
export const NEWLINES = /\r\n|\r|\n/g

interface TextSectionProps {
  text: string
  disabled: boolean
  write: WriteElement
  /** The element the field edits, whose text an agent's write refused is kept by. */
  element: Pick<ElementKey, 'frame' | 'index'>
}

/**
 * Text, for an element holding text alone: a text area applying on Enter or
 * blur and cancelling on Esc, with the keys hinted on a line kept for them
 * while it has focus. Text
 * is one line, since a `<br>` would end the text-only state that shows this
 * field, so a newline, typed with Shift or pasted, becomes a space. The
 * written text stays shown until the frame reloads with it. Text an agent's
 * write to the element refused stays as an unsaved draft, here or once the
 * element is selected again, so Enter applies it over the agent's version.
 */
export function TextSection({
  text,
  disabled,
  write,
  element,
}: TextSectionProps) {
  const [draft, setDraft] = useState<string | null>(() => keptText(element))
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
    forgetText(element)
    if (draft === text) return
    setSent({ value: draft, over: text })
    void write({ kind: 'text', value: draft }).then((written) => {
      if (written) return
      setSent(null)
      setDraft(keptText(element))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!event.shiftKey) commit()
    }
    if (event.key === 'Escape') {
      setDraft(null)
      forgetText(element)
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
      {/* The line is kept while hidden, so focusing the field moves no section below. */}
      <p
        // `cn` reads the `text-caption` step as a color and drops it, so the size goes by its length.
        className={cn(
          'mt-2.5 flex items-center gap-1 text-(length:--text-caption) font-normal text-muted-foreground',
          !focused && 'invisible',
        )}
      >
        <Kbd>Enter</Kbd> to apply, <Kbd>Esc</Kbd> to cancel
      </p>
    </section>
  )
}
