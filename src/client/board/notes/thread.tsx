import { cn } from 'cn'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

import { initials, useAuthor } from '@/client/board/chrome/author'
import { useLive } from '@/client/live/store'
import { writeBoard } from '@/client/live/write'
import type { BoardNote } from '@/shared/records/notes'

import { NoteButton, NoteCard } from './composer'
import { carriesFiles, transferredImages, useDraftImages } from './draft-images'
import { addressee, defaultSession, messageFor, pickedSession } from './form'
import { DraftStrip, MessageImages } from './images'
import { SessionPicker } from './session-picker'
import { setDraft, useNotesUi } from './tool'

interface ThreadProps {
  /** The root note and its replies, root first. */
  notes: readonly BoardNote[]
  /** The page's `<project>/<page>` ref, which finds the claim on the note's frame. */
  page?: string
  onClose: () => void
}

/**
 * `Note <n>`, per `canon/design/notes/thread`: the developer's and the
 * agent's messages live from the store, and a reply box that answers in the
 * thread, hands the thread to the picked session with Send, or closes it
 * with Done. A reply takes pasted or dropped images as the composer does,
 * and each message shows its own.
 */
export function Thread({ notes, page, onClose }: ThreadProps) {
  const listeners = useLive((state) => state.listeners)
  const holder = useLive((state) =>
    page ? state.claims[`${page}/${notes[0]?.frame}`]?.session : undefined,
  )
  const canWrite = useLive((state) => state.canWrite)
  const dispatch = useLive((state) => state.dispatch)
  const rootId = notes[0]?.id ?? ''
  const text = useNotesUi((state) => state.drafts[rootId] ?? '')
  const setText = (next: string) => setDraft(rootId, next)
  // A reply never starts a session unless New session is picked by hand.
  const [session, setSession] = useState(() =>
    defaultSession(listeners, holder),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const images = useDraftImages()
  const messages = useRef<HTMLOListElement>(null)
  const followNewest = useNewestInView(messages, notes.length)
  const root = notes[0]
  if (!root) return null
  const picked = pickedSession(session, listeners, holder, dispatch, false)

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
    if (reply === '' && images.images.length > 0) {
      setError('Write a reply to go with the images')
      return
    }
    if (reply === '' && picked === '') {
      setError(
        listeners.length > 1
          ? 'Pick a session to send it to'
          : 'Write a reply first',
      )
      return
    }
    if (reply === '') {
      void run(() =>
        writeBoard(`/api/notes/${root.id}/send`, addressee(picked)),
      )
      return
    }
    void run(
      async () => {
        const stored = page ? await images.upload(page) : []
        await writeBoard(`/api/notes/${root.id}/replies`, {
          text: reply,
          ...(stored.length === 0 ? {} : { images: stored }),
          ...addressee(picked),
        })
      },
      () => {
        setText('')
        images.clear()
      },
    )
  }

  return (
    <NoteCard
      title={`Note ${root.number ?? ''}`.trim()}
      listeners={listeners}
      onClose={onClose}
    >
      <ol
        ref={messages}
        aria-label="Messages"
        // Focusable so a keyboard scrolls it, since a message holds no control.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onScroll={followNewest}
        onKeyDown={(event) => {
          // The board binds the arrows to nudges on the window, which would
          // swallow the keys that scroll this list.
          if (SCROLL_KEYS.has(event.key)) event.stopPropagation()
        }}
        className="min-h-0 overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {notes.map((note) => (
          <Message key={note.id} note={note} page={page} />
        ))}
      </ol>
      <form
        className="mx-3 mt-1.5 mb-3 rounded-lg border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        onDragOver={(event) => {
          if (canWrite && page && carriesFiles(event.dataTransfer)) {
            event.preventDefault()
          }
        }}
        onDrop={(event) => {
          if (!canWrite || !page || !carriesFiles(event.dataTransfer)) return
          event.preventDefault()
          event.stopPropagation()
          images.add([...event.dataTransfer.files])
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
          onPaste={(event) => {
            const pasted = transferredImages(event.clipboardData)
            if (!page || pasted.length === 0) return
            event.preventDefault()
            images.add(pasted)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={1}
          className="block min-h-7 w-full resize-none bg-transparent text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
        <DraftStrip images={images.images} onRemove={images.remove} />
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
            optional
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
        {(error ?? images.refusal) ? (
          <p role="alert" className="mt-2 text-destructive">
            {error ?? images.refusal}
          </p>
        ) : null}
      </form>
    </NoteCard>
  )
}

/** One message, the developer's under their initials and the agent's under a purple C. */
function Message({ note, page }: { note: BoardNote; page?: string }) {
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
        {page && note.images ? (
          <MessageImages page={page} images={note.images} />
        ) : null}
      </div>
    </li>
  )
}

/** The keys a focused list scrolls on, which stay with it. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
])

/**
 * Keeps the list scrolled to its newest message as it opens, as the card's
 * cap shrinks it, and as a message arrives, the last only while the list
 * already sat at its newest, so a reader scrolled up stays where they are.
 * Returns the list's scroll handler, which tracks where it sits.
 */
function useNewestInView(
  list: RefObject<HTMLOListElement | null>,
  count: number,
): () => void {
  const atNewest = useRef(true)
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (atNewest.current) element.scrollTo({ top: element.scrollHeight })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [list])
  useLayoutEffect(() => {
    const element = list.current
    if (atNewest.current) element?.scrollTo({ top: element.scrollHeight })
  }, [list, count])
  return () => {
    const element = list.current
    if (!element) return
    atNewest.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 1
  }
}

/** A time as the design writes it, `4:12`, on a 12 hour clock without its half. */
function clock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = date.getHours() % 12 || 12
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')}`
}
