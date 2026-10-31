import { useEffect, useRef, useState } from 'react'

import type { BoardNote } from '@/shared/records/notes'

interface PinListProps {
  /** `<n> notes on <frame>`, the card's heading and its menu's name. */
  title: string
  /** The notes drawing at one spot, in number order. */
  notes: readonly BoardNote[]
  onPick: (id: string) => void
  onClose: () => void
}

/**
 * The list a count pin opens: one row per note at its spot, its number on a
 * small pin and its first line, a row opening that note's thread. Focus
 * starts on the first row, the arrows, Home, and End move it, and Escape
 * closes the list.
 */
export function PinList({ title, notes, onPick, onClose }: PinListProps) {
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    rows.current[0]?.focus()
  }, [])
  const focusRow = (index: number) => {
    const next = (index + notes.length) % notes.length
    setCurrent(next)
    rows.current[next]?.focus()
  }
  const steps: Record<string, () => void> = {
    ArrowDown: () => focusRow(current + 1),
    ArrowUp: () => focusRow(current - 1),
    Home: () => focusRow(0),
    End: () => focusRow(notes.length - 1),
  }
  return (
    <section
      aria-label={title}
      data-note-card
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
          return
        }
        const step = steps[event.key]
        if (step) {
          // The board binds the arrows to nudging a selection, which a list
          // with focus in it never means.
          event.preventDefault()
          event.stopPropagation()
          step()
        }
      }}
      // The canvas pans on a drag and the Note tool pins on a click, and
      // neither belongs to a press inside the card.
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      className="pointer-events-auto flex min-h-0 w-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card text-body text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,.3)]"
    >
      <h2 className="px-3 pt-2.5 pb-1 font-normal text-muted-foreground">
        {title}
      </h2>
      <div
        role="menu"
        aria-label={title}
        className="flex min-h-0 flex-col overflow-y-auto p-1"
      >
        {notes.map((note, index) => (
          <button
            key={note.id}
            ref={(row) => {
              rows.current[index] = row
            }}
            type="button"
            role="menuitem"
            aria-label={`Note ${note.number}: ${firstLine(note.text)}`}
            tabIndex={index === current ? 0 : -1}
            onFocus={() => setCurrent(index)}
            onClick={() => onPick(note.id)}
            className="flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              aria-hidden
              className="grid size-[18px] shrink-0 place-items-center rounded-[9px_9px_9px_2px] bg-note text-caption font-semibold text-[#1a1a1a]"
            >
              {note.number}
            </span>
            <span className="truncate">{firstLine(note.text)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? ''
}
