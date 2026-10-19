import { setTimeout as sleep } from 'node:timers/promises'

import WebSocket from 'ws'

import { readAddress } from '@/server/address'
import {
  type HelloMessage,
  LIVE_PATH,
  type ServerMessage,
} from '@/shared/live-messages'

/** How long a follower waits before looking for a board or a server again, as a board tab does. */
export const RETRY_MS = 500

type NoteMessage = Extract<ServerMessage, { type: 'note' }>

export interface FollowOptions {
  /** The board folder, or null while there is none to follow. */
  findRoot: () => Promise<string | null>
  session: string
  tag: string
  /** Prints one note, and the note is acked only once this returns. */
  print: (note: NoteMessage) => void
  /** Aborting stops the follower, the only way it ends. */
  signal: AbortSignal
  retryMs?: number
}

/**
 * Follows a session's inbox on the board's live socket until aborted. It
 * waits quietly for a board and a running server, upgrades with the address
 * token as a bearer, and prints each note before acking it, so a follower
 * killed between the two prints the note again rather than losing it.
 */
export async function follow({
  findRoot,
  session,
  tag,
  print,
  signal,
  retryMs = RETRY_MS,
}: FollowOptions): Promise<void> {
  while (!signal.aborted) {
    const root = await findRoot()
    const address = root === null ? null : await readAddress(root)
    if (address) await listen(address, { session, tag, print, signal })
    await sleep(retryMs, undefined, { signal }).catch(() => {})
  }
}

/** Holds one socket open until it closes or the follower is aborted. */
function listen(
  address: { url: string; token: string },
  {
    session,
    tag,
    print,
    signal,
  }: Pick<FollowOptions, 'session' | 'tag' | 'print' | 'signal'>,
): Promise<void> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `${address.url.replace(/^http/, 'ws')}${LIVE_PATH}`,
      { headers: { authorization: `Bearer ${address.token}` } },
    )
    const stop = () => socket.terminate()
    signal.addEventListener('abort', stop, { once: true })
    socket.on('open', () => {
      const hello: HelloMessage = { type: 'hello', role: 'inbox', session, tag }
      socket.send(JSON.stringify(hello))
    })
    socket.on('message', (data) => {
      let message: ServerMessage
      try {
        message = JSON.parse(String(data)) as ServerMessage
      } catch {
        return
      }
      if (message.type !== 'note') return
      print(message)
      socket.send(JSON.stringify({ type: 'ack', id: message.note.id }))
    })
    // A refused or dropped connection is a server not running yet, so it
    // stays quiet and the loop tries again.
    socket.on('error', () => {})
    socket.on('close', () => {
      signal.removeEventListener('abort', stop)
      resolve()
    })
  })
}
