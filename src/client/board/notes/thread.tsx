import { cn } from 'cn'
import { useState } from 'react'

import { initials, useAuthor } from '@/client/board/chrome/author'
import { useLive } from '@/client/live/store'
import { writeBoard } from '@/client/live/write'
import type { BoardNote } from '@/shared/records/notes'

import { NoteButton, NoteCard } from './composer'
import { defaultSession, messageFor } from './form'
import { SessionPicker } from './session-picker'

interface ThreadProps {
  /** The root note and its replies, root first. */
  notes: readonly BoardNote[]
  onClose: () => void
}

/**
 * `Note <n>`, per `canon/design/notes/thread`: the developer's and the
 * agent's messages live from the store, and a reply box that answers in the
 * thread, hands the thread to the picked session with Send, or closes it
 * with Done.
 */
export function Thread({ notes, onClose }: ThreadProps) {
  const listeners = useLive((state) => state.listeners)
  const canWrite = useLive((state) => state.canWrite)
  const [text, setText] = useState('')
  const [session, setSession] = useState(() => defaultSession(listeners))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const root = notes[0]
  if (!root) return null
  const picked = listeners.some((listener) => listener.session === session)
    ? session
    : defaultSession(listeners)

  const run = async (write: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    try {
      await write()
      after?.()
    } catch (failure) {
      setError(messageFor(failure))
    } finally {
      setBusy(false)
    }
  }

  const send = () => {
    const reply = text.trim()
    if (reply === '' && picked === '') {
      setError(
        listeners.length > 1
          ? 'Pick a session to send it to'
          : 'Write a reply first',
      )
      return
    }
    if (reply === '') {
      void run(() => writeBoard(`/api/notes/${root.id}/send`, { to: picked }))
      return
    }
    void run(
      () =>
        writeBoard(`/api/notes/${root.id}/replies`, {
          text: reply,
          ...(picked === '' ? {} : { to: picked }),
        }),
      () => setText(''),
    )
  }

  return (
    <NoteCard
      title={`Note ${root.number ?? ''}`.trim()}
      listeners={listeners}
      onClose={onClose}
    >
      <ol aria-label="Messages">
        {notes.map((note) => (
          <Message key={note.id} note={note} />
        ))}
      </ol>
      <form
        className="mx-3 mt-1.5 mb-3 rounded-lg border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          aria-label="Reply"
          placeholder="Reply, or hand it on…"
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
          rows={1}
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
          />
          <NoteButton
            variant="ghost"
            className="ml-auto"
            disabled={!canWrite || busy}
            onClick={() =>
              void run(
                () => writeBoard(`/api/notes/${root.id}/done`, {}),
                onClose,
              )
            }
          >
            Done
          </NoteButton>
          <NoteButton
            type="submit"
            variant="primary"
            disabled={!canWrite || busy}
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

/** One message, the developer's under their initials and the agent's under a purple C. */
function Message({ note }: { note: BoardNote }) {
  const author = useAuthor()
  const agent = note.from === 'agent'
  return (
    <li className="flex gap-2.5 px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          'grid size-[22px] flex-none place-items-center rounded-full text-[10px] font-bold',
          agent ? 'bg-claim/25 text-claim' : 'bg-foreground text-card',
        )}
      >
        {agent ? 'C' : initials(note.author ?? author ?? '') || 'Y'}
      </span>
      <div className="min-w-0">
        <b className="font-semibold">{agent ? 'claude' : 'You'}</b>
        <time dateTime={note.createdAt} className="ml-1.5 text-faint">
          {clock(note.createdAt)}
        </time>
        <p className="mt-0.5 leading-[1.45] break-words whitespace-pre-wrap">
          {note.text}
        </p>
      </div>
    </li>
  )
}

/** A time as the design writes it, `4:12`, on a 12 hour clock without its half. */
function clock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = date.getHours() % 12 || 12
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')}`
}
