import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { newAddress, writeAddress } from '@/server/address'
import { type RunningServer, startServer } from '@/server/start'
import type { ServerMessage } from '@/shared/live-messages'
import type { Note } from '@/shared/records/notes'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { follow } from './follow'

type NoteMessage = Extract<ServerMessage, { type: 'note' }>

const SESSION = 'sess-1'

function queued(id: string): Note {
  return {
    id,
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'Tighten the header',
    from: 'developer',
    author: null,
    session: null,
    to: SESSION,
    state: 'queued',
    thread: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  }
}

describe('follow', { timeout: 15_000 }, () => {
  let board: FixtureBoard
  let clientDir: string
  let server: RunningServer | undefined
  let followers: AbortController[]
  let notesFile: string

  beforeEach(() => {
    board = copyFixtureBoard('live')
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    notesFile = join(board.root, 'studio/home/notes.json')
    followers = []
  })

  afterEach(async () => {
    for (const controller of followers) controller.abort()
    await server?.close()
    server = undefined
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  async function serve(): Promise<void> {
    server = await startServer({
      clientDir,
      facesDir: clientDir,
      root: board.root,
      port: 0,
      openUrl: () => {},
    })
    const address = newAddress({
      root: board.root,
      host: '127.0.0.1',
      port: server.port,
    })
    await writeAddress(board.root, address)
    server.authorize(address.token)
  }

  function startFollower(): NoteMessage[] {
    const printed: NoteMessage[] = []
    const controller = new AbortController()
    followers.push(controller)
    void follow({
      findRoot: async () => board.root,
      session: SESSION,
      tag: 'claude · live',
      print: (note) => printed.push(note),
      signal: controller.signal,
      retryMs: 50,
    })
    return printed
  }

  /** Resolves once a board tab is told this session is listening. */
  async function boardHearsListener(): Promise<void> {
    const tab = new WebSocket(`ws://127.0.0.1:${server?.port}/api/live`)
    await new Promise((resolve) => tab.once('open', resolve))
    const heard = new Promise<void>((resolve) =>
      tab.on('message', (data) => {
        const message = JSON.parse(String(data)) as ServerMessage
        if (message.type === 'listeners' && message.listeners.length > 0) {
          resolve()
        }
      }),
    )
    tab.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await heard
    tab.terminate()
  }

  function writeNotes(notes: Note[]): void {
    writeFileSync(notesFile, JSON.stringify({ version: 1, notes }))
  }

  function stateOnDisk(): string | undefined {
    return JSON.parse(readFileSync(notesFile, 'utf8')).notes[0]?.state
  }

  it('prints a note queued before it connected, once, and marks it delivered', async () => {
    writeNotes([queued('n_0000000a')])
    await serve()

    const printed = startFollower()

    await expect.poll(() => stateOnDisk(), { timeout: 5000 }).toBe('delivered')
    expect(printed.map((note) => note.note.id)).toEqual(['n_0000000a'])
    expect(printed[0]?.line).toMatch(
      /^frameboard note n_0000000a on studio\/home\/hero: /,
    )
  })

  it('prints a note queued while it runs', async () => {
    await serve()
    const listening = boardHearsListener()
    const printed = startFollower()
    await listening

    writeNotes([queued('n_0000000b')])

    await expect
      .poll(() => printed.map((note) => note.note.id), { timeout: 5000 })
      .toEqual(['n_0000000b'])
  })

  it('does not print an acked note again after a reconnect', async () => {
    writeNotes([queued('n_0000000a')])
    await serve()
    const first = startFollower()
    await expect.poll(() => stateOnDisk(), { timeout: 5000 }).toBe('delivered')
    followers[0]?.abort()

    const second = startFollower()
    writeNotes([
      { ...queued('n_0000000a'), state: 'delivered' },
      { ...queued('n_0000000c'), number: 2 },
    ])

    await expect
      .poll(() => second.map((note) => note.note.id), { timeout: 5000 })
      .toEqual(['n_0000000c'])
    expect(first).toHaveLength(1)
  })

  it('prints nothing and keeps waiting while no server runs, then connects once one starts', async () => {
    writeNotes([queued('n_0000000a')])
    const printed = startFollower()
    // The window the follower runs with no server is what is asserted.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(printed).toEqual([])

    await serve()

    await expect.poll(() => printed.length, { timeout: 5000 }).toBe(1)
  })
})
