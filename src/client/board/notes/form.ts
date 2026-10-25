import { BoardWriteError } from '@/client/live/write'
import type { Listener } from '@/shared/records/notes'

/**
 * The session a picker starts on: the session holding the frame's claim
 * while it listens, else the only listener, else none until the developer
 * picks. A holder that stopped listening is never picked, since it would
 * never see the note.
 */
export function defaultSession(
  listeners: readonly Listener[],
  holder?: string,
): string {
  if (holder && listeners.some((listener) => listener.session === holder)) {
    return holder
  }
  return listeners.length === 1 ? (listeners[0]?.session ?? '') : ''
}

/** One short sentence on how to fix a refused write. */
export function messageFor(failure: unknown): string {
  if (failure instanceof BoardWriteError) {
    if (failure.code === 'stale-address') {
      return 'The frame changed since it was clicked. Click the element again.'
    }
    if (failure.code === 'unauthorized') {
      return 'This tab cannot write. Run frameboard open for a tab that can.'
    }
    if (failure.code === 'notes-invalid') {
      return "This page's notes.json does not read. Fix it by hand and try again."
    }
  }
  return 'The note did not save. Try again.'
}
