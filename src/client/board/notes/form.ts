import { BoardWriteError } from '@/client/live/write'
import type { Listener } from '@/shared/records/notes'

/** The picker's value for starting a session rather than sending to a listener. */
export const NEW_SESSION = 'frameboard:new-session'

/**
 * The session a picker starts on: the session holding the frame's claim
 * while it listens, else the only listener, else a new session when nobody
 * listens and `serve` can start one, else none until the developer picks. A
 * holder that stopped listening is never picked, since it would never see
 * the note.
 */
export function defaultSession(
  listeners: readonly Listener[],
  holder?: string,
  dispatch = false,
): string {
  if (holder && listeners.some((listener) => listener.session === holder)) {
    return holder
  }
  if (listeners.length === 1) return listeners[0]?.session ?? ''
  return listeners.length === 0 && dispatch ? NEW_SESSION : ''
}

/**
 * The pick a picker shows: the developer's while the picker still offers it,
 * so a listener leaving takes its pick with it and a sole one arriving is
 * picked.
 */
export function pickedSession(
  session: string,
  listeners: readonly Listener[],
  holder: string | undefined,
  dispatch: boolean,
): string {
  const offered =
    (session === NEW_SESSION && dispatch) ||
    listeners.some((listener) => listener.session === session)
  return offered ? session : defaultSession(listeners, holder, dispatch)
}

/** The body fields that address a write to the picked session, none for no pick. */
export function addressee(
  picked: string,
): { to: string } | { dispatch: true } | Record<string, never> {
  if (picked === '') return {}
  return picked === NEW_SESSION ? { dispatch: true } : { to: picked }
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
    if (failure.code === 'dispatch-unavailable') {
      return 'Restart serve with FRAMEBOARD_DISPATCH set to start a session.'
    }
    if (failure.code === 'dispatch-failed') {
      return 'The session did not start. Check .run/dispatch.log and try again.'
    }
  }
  return 'The note did not save. Try again.'
}
