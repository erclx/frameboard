import { describe, expect, it, vi } from 'vitest'

import type { Listener, Note } from '@/shared/records/notes'

import { createDelivery, type Follower, type NoteDelivery } from './delivery'

const NOW = new Date('2026-10-19T10:00:00.000Z')

function rootNote(id: string, to: string): Note {
  return {
    id,
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'x',
    from: 'developer',
    author: null,
    session: null,
    to,
    state: 'queued',
    thread: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }
}

/** An in-memory notes file standing in for the disk the real store rereads. */
function fakeBoard() {
  const notes = new Map<string, Note>()
  const listenerChanges: Listener[][] = []
  const delivery = createDelivery({
    pending: async (session) =>
      [...notes.values()]
        .filter((note) => note.to === session && note.state === 'queued')
        .map((note) => ({ note, ref: 'webapp/home/hero', line: note.id })),
    markDelivered: async (id) => {
      const note = notes.get(id)
      if (note) notes.set(id, { ...note, state: 'delivered' })
    },
    onListeners: (listeners) => listenerChanges.push(listeners),
    now: () => NOW,
  })
  const queue = (id: string, to: string) => notes.set(id, rootNote(id, to))
  return { notes, delivery, queue, listenerChanges }
}

function follower(): Follower & { printed: string[] } {
  const printed: string[] = []
  return { printed, send: (d: NoteDelivery) => printed.push(d.line) }
}

/** Lets the flush a register or unregister starts settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('delivery', () => {
  it('sends a note queued before the follower connected on its hello', async () => {
    const { delivery, queue } = fakeBoard()
    queue('n_1', 'sess')
    const inbox = follower()

    delivery.register(inbox, 'sess', 'claude · app')
    await settled()

    expect(inbox.printed).toEqual(['n_1'])
  })

  it('sends a note queued while the follower runs once offered', async () => {
    const { delivery, queue } = fakeBoard()
    const inbox = follower()
    delivery.register(inbox, 'sess', 'claude · app')
    await settled()

    queue('n_1', 'sess')
    await delivery.offer()

    expect(inbox.printed).toEqual(['n_1'])
  })

  it('sends a note to its own session only', async () => {
    const { delivery, queue } = fakeBoard()
    const mine = follower()
    const other = follower()
    delivery.register(mine, 'sess', 'a')
    delivery.register(other, 'other', 'b')
    queue('n_1', 'sess')

    await delivery.offer()

    expect(other.printed).toEqual([])
  })

  it('marks a note delivered on its ack and never sends it again', async () => {
    const { delivery, queue, notes } = fakeBoard()
    const inbox = follower()
    delivery.register(inbox, 'sess', 'a')
    queue('n_1', 'sess')
    await delivery.offer()

    await delivery.ack(inbox, 'n_1')
    delivery.unregister(inbox)
    const again = follower()
    delivery.register(again, 'sess', 'a')
    await settled()

    expect(notes.get('n_1')?.state).toBe('delivered')
    expect(again.printed).toEqual([])
  })

  it('does not repeat an unacked note while its follower holds it', async () => {
    const { delivery, queue } = fakeBoard()
    const inbox = follower()
    delivery.register(inbox, 'sess', 'a')
    queue('n_1', 'sess')

    await delivery.offer()
    await delivery.offer()

    expect(inbox.printed).toEqual(['n_1'])
  })

  it('sends an unacked note again to a follower that reconnects', async () => {
    const { delivery, queue } = fakeBoard()
    const first = follower()
    delivery.register(first, 'sess', 'a')
    queue('n_1', 'sess')
    await delivery.offer()

    delivery.unregister(first)
    const second = follower()
    delivery.register(second, 'sess', 'a')
    await settled()

    expect(second.printed).toEqual(['n_1'])
  })

  it('never sends a note marked done while its session was offline', async () => {
    const { delivery, queue, notes } = fakeBoard()
    queue('n_1', 'sess')
    notes.set('n_1', { ...rootNote('n_1', 'sess'), state: 'done' })
    const inbox = follower()

    delivery.register(inbox, 'sess', 'a')
    await settled()

    expect(inbox.printed).toEqual([])
  })

  it('prints each note once across two followers of one session', async () => {
    const { delivery, queue } = fakeBoard()
    const first = follower()
    const resumed = follower()
    delivery.register(first, 'sess', 'a')
    delivery.register(resumed, 'sess', 'a')
    queue('n_1', 'sess')

    await delivery.offer()

    expect([...first.printed, ...resumed.printed]).toEqual(['n_1'])
  })

  it('lists two followers of one session as one listener', () => {
    const { delivery } = fakeBoard()

    delivery.register(follower(), 'sess', 'claude · app')
    delivery.register(follower(), 'sess', 'claude · app')

    expect(delivery.listeners()).toEqual([
      { session: 'sess', tag: 'claude · app', since: NOW.toISOString() },
    ])
  })

  it('tells two listeners sharing a tag apart by their ids', () => {
    const { delivery } = fakeBoard()

    delivery.register(follower(), 'abcdef123', 'claude · app')
    delivery.register(follower(), '987654zyx', 'claude · app')

    expect(delivery.listeners().map((listener) => listener.tag)).toEqual([
      'abcdef',
      '987654',
    ])
  })

  it('reports a session leaving once its last follower goes', () => {
    const { delivery, listenerChanges } = fakeBoard()
    const first = follower()
    const second = follower()
    delivery.register(first, 'sess', 'a')
    delivery.register(second, 'sess', 'a')

    delivery.unregister(first)
    delivery.unregister(second)

    expect(listenerChanges).toEqual([
      [{ session: 'sess', tag: 'a', since: NOW.toISOString() }],
      [],
    ])
  })

  it('does not resend a note acked while a flush was reading the file', async () => {
    const reads: ((queued: NoteDelivery[]) => void)[] = []
    const delivered = new Set<string>()
    const delivery = createDelivery({
      pending: () => new Promise((resolve) => reads.push(resolve)),
      markDelivered: async (id) => {
        delivered.add(id)
      },
      onListeners: () => {},
      now: () => NOW,
    })
    const queued = [{ note: rootNote('n_1', 'sess'), ref: 'r', line: 'n_1' }]
    const inbox = follower()
    delivery.register(inbox, 'sess', 'a')
    await vi.waitFor(() => expect(reads).toHaveLength(1))
    reads[0]?.(queued)
    await vi.waitFor(() => expect(inbox.printed).toEqual(['n_1']))
    const offered = delivery.offer()
    await vi.waitFor(() => expect(reads).toHaveLength(2))

    const acked = delivery.ack(inbox, 'n_1')
    reads[1]?.(queued)
    await Promise.all([offered, acked])

    expect(inbox.printed).toEqual(['n_1'])
    expect(delivered).toEqual(new Set(['n_1']))
  })
})
