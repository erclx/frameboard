import { type KeyboardEvent, useRef, useState } from 'react'

import { Kbd } from '@/client/components/ui/kbd'
import { Textarea } from '@/client/components/ui/textarea'
import { cn } from '@/client/lib/cn'

import type { ElementKey } from '../../selection'
import { isStrayHistory } from './stray-history'
import { forgetText, keptText, type WriteElement } from './write'

/** A pasted line break, in any platform's form. */
export const NEWLINES = /\r\n|\r|\n/g

interface TextSectionProps {
  text: string
  /** Whether the element shows a newline in its text as a line, so the field keeps one. */
  keepsBreaks: boolean
  disabled: boolean
  write: WriteElement
  /** The element the field edits, whose text an agent's write refused is kept by. */
  element: Pick<ElementKey, 'frame' | 'index'>
}

/**
 * Text, for an element holding text alone: a text area applying on Enter or
 * blur and cancelling on Esc, with the keys hinted on a line kept for them
 * while it has focus. The field adds no line, since Enter applies, and a
 * pasted newline becomes a space unless the element keeps its breaks, as a
 * text given lines on the canvas does, whose breaks it keeps as they are. The
 * written text stays shown until the frame reloads with it. Text an agent's
 * write to the element refused stays as an unsaved draft, here or once the
 * element is selected again, so Enter applies it over the agent's version.
 */
export function TextSection({
  text,
  keepsBreaks,
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
          const { value } = event.currentTarget
          setDraft(value.replace(NEWLINES, keepsBreaks ? '\n' : ' '))
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
