import { useSyncExternalStore } from 'react'

import { writeBoard } from '@/client/live/write'

/** The initials of a name's first two words, such as `EL` for Eric Le. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

/** Where the signing name comes from: saved on this machine, or git's `user.name`. */
export type AuthorSource = 'config' | 'git'

interface Author {
  name: string | null
  source: AuthorSource | null
}

let author: Author | undefined
let requested = false
const listeners = new Set<() => void>()

/**
 * The signing name `GET /api/author` answers, read once per load and shared
 * by every avatar. Undefined until it arrives, and null when neither this
 * machine nor git has one, or the read fails.
 */
export function useAuthor(): string | null | undefined {
  return useSyncExternalStore(subscribeAuthor, () => author?.name)
}

/** Where `useAuthor`'s name comes from, null when there is none or it has not arrived. */
export function useAuthorSource(): AuthorSource | null {
  return useSyncExternalStore(subscribeAuthor, () => author?.source ?? null)
}

/**
 * Saves the signing name on this machine, or clears it on an empty string so
 * git's name answers again, and shows the answer on every avatar. Rejects
 * with the server's refusal and leaves the name as it was.
 */
export async function setAuthor(name: string): Promise<void> {
  publish(await writeBoard<Author>('/api/author', { name }))
}

function publish(next: Author): void {
  author = next
  for (const notify of listeners) notify()
}

function subscribeAuthor(listener: () => void): () => void {
  listeners.add(listener)
  if (!requested) {
    requested = true
    void fetch('/api/author')
      .then((response) => response.json() as Promise<AuthorBody>)
      .then((body): Author =>
        body.ok ? body.data : { name: null, source: null },
      )
      .catch((): Author => ({ name: null, source: null }))
      .then((read) => {
        // A save that landed first is newer than this read.
        if (author === undefined) publish(read)
      })
  }
  return () => {
    listeners.delete(listener)
  }
}

type AuthorBody = { ok: true; data: Author } | { ok: false }
