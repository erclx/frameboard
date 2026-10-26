import { cn } from 'cn'
import { useState } from 'react'

import { useLive } from '@/client/live/store'
import { writeBoard } from '@/client/live/write'

import { modeStore } from '../mode'
import { addressee, defaultSession, messageFor, pickedSession } from './form'
import type { NotePick } from './pick'
import { ListeningCount, SessionPicker } from './session-picker'
import { newNoteDraft, setDraft, useNotesUi } from './tool'

interface ComposerProps {
  pick: NotePick
  onClose: () => void
}

/**
 * `New note on <frame>`, per `canon/design/notes/place`: the text, the
 * listening session it goes to, Save to pin it without sending, and Send to
 * pin it and queue it to that session, or to start a new one with it.
 */
export function Composer({ pick, onClose }: ComposerProps) {
  const listeners = useLive((state) => state.listeners)
  const holder = useLive((state) => state.claims[pick.frame.ref]?.session)
  const canWrite = useLive((state) => state.canWrite)
  const dispatch = useLive((state) => state.dispatch)
  // Kept by frame, so a composer closed by a stray press reopens with it.
  const draftKey = newNoteDraft(pick.frame.ref)
  const text = useNotesUi((state) => state.drafts[draftKey] ?? '')
  const setText = (next: string) => setDraft(draftKey, next)
  const [session, setSession] = useState(() =>
    defaultSession(listeners, holder, dispatch),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picked = pickedSession(session, listeners, holder, dispatch)

  const save = async (to: string | null) => {
    if (text.trim() === '') {
      setError('Write the note first')
      return
    }
    if (to === '') {
      setError('Pick a session to send it to')
      return
    }
    setBusy(true)
    try {
      await writeBoard('/api/notes', {
        frame: pick.frame.ref,
        text: text.trim(),
        ...(pick.element === null
          ? {}
          : { element: pick.element, renderedAt: pick.renderedAt }),
        ...(to === null ? {} : addressee(to)),
      })
      setText('')
      // One note per pick, as the Frame tool places one frame.
      if (modeStore.getState().tool === 'note') {
        modeStore.setState({ tool: 'move' })
      }
      onClose()
    } catch (failure) {
      setError(messageFor(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NoteCard
      title={`New note on ${pick.frame.name}`}
      listeners={listeners}
      onClose={onClose}
    >
      <form
        className="m-3 rounded-lg border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save(picked)
        }}
      >
        <textarea
          aria-label={`Note on ${pick.frame.name}`}
          // The composer opens on a click meant to start writing.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={text}
          disabled={!canWrite}
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={2}
          className="block min-h-7 w-full resize-none bg-transparent text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-2">
          <SessionPicker
            listeners={listeners}
            value={picked}
            onChange={(next) => {
              setSession(next)
              setError(null)
            }}
            disabled={!canWrite}
            dispatch={dispatch}
          />
          <NoteButton
            variant="ghost"
            className="ml-auto"
            disabled={!canWrite || busy}
            onClick={() => void save(null)}
          >
            Save
          </NoteButton>
          <NoteButton
            type="submit"
            variant="primary"
            disabled={
              !canWrite || busy || (listeners.length === 0 && !dispatch)
            }
          >
            Send
          </NoteButton>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </NoteCard>
  )
}

interface NoteCardProps {
  title: string
  listeners: Parameters<typeof ListeningCount>[0]['listeners']
  onClose: () => void
  children: React.ReactNode
}

/** The card both the composer and the thread draw in, closing on Esc. */
export function NoteCard({
  title,
  listeners,
  onClose,
  children,
}: NoteCardProps) {
  return (
    <section
      aria-label={title}
      data-note-card
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      // The canvas pans on a drag and the Note tool pins on a click, and
      // neither belongs to a press inside the card.
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      className="pointer-events-auto w-[300px] overflow-hidden rounded-xl border border-border bg-card text-body text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,.3)]"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 font-semibold">
        <h2 className="truncate">{title}</h2>
        <ListeningCount listeners={listeners} />
      </header>
      {children}
    </section>
  )
}

interface NoteButtonProps extends React.ComponentProps<'button'> {
  variant: 'ghost' | 'primary'
}

/** The note card's 26 px buttons, Save and Done in the raised gray and Send in the accent. */
export function NoteButton({
  variant,
  className,
  type = 'button',
  ...props
}: NoteButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex h-[26px] shrink-0 items-center rounded-lg px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-muted text-foreground hover:bg-accent',
        className,
      )}
      {...props}
    />
  )
}
