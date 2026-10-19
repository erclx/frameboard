import type { Listener, Note } from '@/shared/records/notes'

/** A queued note as a follower receives it. */
export interface NoteDelivery {
  note: Note
  ref: string
  line: string
}

/** One follower's end of the socket. */
export interface Follower {
  send: (delivery: NoteDelivery) => void
}

export interface DeliveryOptions {
  /**
   * The notes queued to a session, reread from disk on every call, so a note
   * marked done since it was queued is never sent.
   */
  pending: (session: string) => Promise<NoteDelivery[]>
  /** Marks a note delivered to a session, once its follower printed it. */
  markDelivered: (id: string, session: string) => Promise<void>
  /** Told whenever the listening sessions change. */
  onListeners: (listeners: Listener[]) => void
  now: () => Date
}

export interface Delivery {
  register: (follower: Follower, session: string, tag: string) => void
  unregister: (follower: Follower) => void
  /** A follower printed a note, which then stops being redelivered. */
  ack: (follower: Follower, id: string) => Promise<void>
  /** Sends whatever is queued to the listening sessions named, or to every one. */
  offer: (sessions?: string[]) => Promise<void>
  listeners: () => Listener[]
}

interface Entry {
  /** Newest last, and only the newest is sent to, so a note prints once. */
  followers: Follower[]
  tag: string
  since: string
  /** Notes sent and not yet acked, by id, with the follower holding each. */
  inflight: Map<string, Follower>
}

/**
 * The listener registry and the queue. A note stays `queued` on disk until a
 * follower acks it, so a follower that drops before its ack gets it again on
 * reconnect, and an acked note is never sent again.
 */
export function createDelivery({
  pending,
  markDelivered,
  onListeners,
  now,
}: DeliveryOptions): Delivery {
  const sessions = new Map<string, Entry>()

  const listeners = (): Listener[] => {
    const entries = [...sessions.entries()]
    const counts = new Map<string, number>()
    for (const [, entry] of entries) {
      counts.set(entry.tag, (counts.get(entry.tag) ?? 0) + 1)
    }
    return entries.map(([session, entry]) => ({
      session,
      // Two listeners sharing a tag read apart by their ids.
      tag: (counts.get(entry.tag) ?? 0) > 1 ? session.slice(0, 6) : entry.tag,
      since: entry.since,
    }))
  }

  const flush = async (session: string): Promise<void> => {
    const queued = await pending(session)
    const entry = sessions.get(session)
    const follower = entry?.followers.at(-1)
    if (!entry || !follower) return
    for (const delivery of queued) {
      if (entry.inflight.has(delivery.note.id)) continue
      entry.inflight.set(delivery.note.id, follower)
      follower.send(delivery)
    }
  }

  const sessionOf = (follower: Follower): string | undefined =>
    [...sessions.entries()].find(([, entry]) =>
      entry.followers.includes(follower),
    )?.[0]

  return {
    register: (follower, session, tag) => {
      const entry = sessions.get(session)
      if (entry) {
        entry.followers.push(follower)
      } else {
        sessions.set(session, {
          followers: [follower],
          tag,
          since: now().toISOString(),
          inflight: new Map(),
        })
        onListeners(listeners())
      }
      void flush(session).catch(() => {})
    },
    unregister: (follower) => {
      const session = sessionOf(follower)
      const entry = session === undefined ? undefined : sessions.get(session)
      if (session === undefined || !entry) return
      entry.followers = entry.followers.filter((each) => each !== follower)
      for (const [id, holder] of entry.inflight) {
        if (holder === follower) entry.inflight.delete(id)
      }
      if (entry.followers.length === 0) {
        sessions.delete(session)
        onListeners(listeners())
        return
      }
      void flush(session).catch(() => {})
    },
    ack: async (follower, id) => {
      const session = sessionOf(follower)
      const entry = session === undefined ? undefined : sessions.get(session)
      if (session === undefined || entry?.inflight.get(id) !== follower) return
      await markDelivered(id, session)
      entry.inflight.delete(id)
    },
    offer: async (names) => {
      const targets = (names ?? [...sessions.keys()]).filter((session) =>
        sessions.has(session),
      )
      await Promise.all(targets.map(flush))
    },
    listeners,
  }
}
