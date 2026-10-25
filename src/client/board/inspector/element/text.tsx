import { type KeyboardEvent, useRef, useState } from 'react'

import { Textarea } from '@/client/components/ui/textarea'

import { isStrayHistory } from './stray-history'
import type { WriteElement } from './write'

interface TextSectionProps {
  text: string
  disabled: boolean
  write: WriteElement
}

/**
 * Text, for an element holding text alone: a text area committing on blur
 * or Cmd+Enter and cancelling on Esc. The written text stays shown until the
 * frame reloads with it.
 */
export function TextSection({ text, disabled, write }: TextSectionProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [sent, setSent] = useState<{ value: string; over: string } | null>(null)
  if (sent && sent.over !== text) setSent(null)
  const held = sent?.over === text ? sent.value : null

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
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commit()
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
          setDraft(event.currentTarget.value)
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="min-h-11 resize-none rounded-md border-0 bg-input px-2 py-1.5 text-xs leading-[1.4] md:text-xs dark:bg-input"
      />
    </section>
  )
}
