import { useSyncExternalStore } from 'react'

/** The initials of a name's first two words, such as `EL` for Eric Le. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

type AuthorState = string | null | undefined

let author: AuthorState
let requested = false
const listeners = new Set<() => void>()

/**
 * The signing name `GET /api/author` answers, read once per load and shared
 * by every avatar. Undefined until it arrives, and null when git has none or
 * the read fails.
 */
export function useAuthor(): AuthorState {
  return useSyncExternalStore(subscribeAuthor, () => author)
}

function subscribeAuthor(listener: () => void): () => void {
  listeners.add(listener)
  if (!requested) {
    requested = true
    void fetch('/api/author')
      .then((response) => response.json() as Promise<AuthorBody>)
      .then((body) => (body.ok ? body.data.name : null))
      .catch(() => null)
      .then((name) => {
        author = name
        for (const notify of listeners) notify()
      })
  }
  return () => {
    listeners.delete(listener)
  }
}

type AuthorBody = { ok: true; data: { name: string | null } } | { ok: false }
