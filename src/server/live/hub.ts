import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

import { type WebSocket, WebSocketServer } from 'ws'

import {
  type ClientMessage,
  LIVE_PATH,
  type ServerMessage,
} from '@/shared/live-messages'
import type { Finding } from '@/shared/records/check'
import type { ListResult } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import { type Access, isWriter } from '../access/guard'
import { isBoardHost } from '../app'
import type { Delivery, Follower } from '../notes/delivery'
import type { BoardTabs } from '../start'

export interface LiveHub {
  /** Takes an HTTP upgrade for the socket path, refusing any other path, host, or origin. */
  handleUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void
  /** Sends a message to every board client. */
  broadcast: (message: ServerMessage) => void
  close: () => Promise<void>
}

export interface HubOptions {
  /** Told of every board client that opens and closes, which is what `serve` waits on. */
  tabs: BoardTabs
  port: () => number
  /** Decides from the upgrade request whether a tab may write. */
  access: Access
  /** The board as it stands, sent to a board client on its hello. */
  snapshot: () => Promise<ListResult>
  /** Every frame's check findings, sent on a hello after the board. */
  findings?: () => Promise<Record<string, Finding[]>>
  /** Every page's notes by page ref, sent to a board client after its access. */
  notes?: () => Promise<Record<string, BoardNote[]>>
  /** The listener registry an inbox client registers with. */
  delivery?: Delivery
}

/**
 * The live socket every board tab holds. A client opens with a hello naming
 * its role, and only a `board` client counts as an open tab and receives the
 * board's messages. An `inbox` client is a session's follower, kept apart so
 * it never counts as a tab, and taken only from a socket upgraded with the
 * address token as a bearer, since a browser page must never register one.
 */
export function createHub({
  tabs,
  port,
  access,
  snapshot,
  findings,
  notes,
  delivery,
}: HubOptions): LiveHub {
  const server = new WebSocketServer({ noServer: true })
  const boards = new Map<WebSocket, boolean>()
  const inboxes = new Map<WebSocket, Follower>()

  server.on('connection', (socket, request) => {
    socket.on('message', (data) => {
      const message = parse(String(data))
      const inbox = inboxes.get(socket)
      if (inbox) {
        if (message?.type === 'ack') void delivery?.ack(inbox, message.id)
        return
      }
      if (boards.has(socket) || message?.type !== 'hello') return
      if (message.role === 'inbox') {
        const bearer = isWriter(
          { authorization: request.headers.authorization },
          access,
        )
        if (!bearer || !delivery || !message.session) {
          socket.close(1008, 'An inbox needs the address token as a bearer.')
          return
        }
        const follower: Follower = {
          send: (delivered) => send(socket, { type: 'note', ...delivered }),
        }
        inboxes.set(socket, follower)
        delivery.register(follower, message.session, message.tag)
        return
      }
      const writer = isWriter(
        {
          authorization: request.headers.authorization,
          cookie: request.headers.cookie,
          origin: request.headers.origin,
        },
        access,
      )
      boards.set(socket, writer)
      tabs.open(writer)
      void snapshot()
        .then(async (board) => {
          send(socket, { type: 'board', data: board })
          send(socket, { type: 'access', write: writer })
          if (notes) {
            for (const [page, list] of Object.entries(await notes())) {
              send(socket, { type: 'notes', page, notes: list })
            }
          }
          if (delivery) {
            send(socket, {
              type: 'listeners',
              listeners: delivery.listeners(),
            })
          }
          if (findings) {
            send(socket, { type: 'findings', findings: await findings() })
          }
        })
        .catch(() => {})
    })
    socket.on('close', () => {
      const inbox = inboxes.get(socket)
      if (inbox) {
        inboxes.delete(socket)
        delivery?.unregister(inbox)
      }
      const writer = boards.get(socket)
      if (writer !== undefined) {
        boards.delete(socket)
        tabs.close(writer)
      }
    })
  })

  return {
    handleUpgrade: (request, socket, head) => {
      if (!accepts(request, port())) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
        return
      }
      server.handleUpgrade(request, socket, head, (client) =>
        server.emit('connection', client, request),
      )
    },
    broadcast: (message) => {
      for (const socket of boards.keys()) send(socket, message)
    },
    close: () => {
      for (const socket of server.clients) socket.terminate()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

/**
 * A socket reads the board without CORS, so beside the host check an origin
 * the browser sent has to be the board's own page.
 */
function accepts(request: IncomingMessage, port: number): boolean {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  if (pathname !== LIVE_PATH) return false
  if (!isBoardHost(request.headers.host ?? '', port)) return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return isBoardHost(new URL(origin).host, port)
  } catch {
    return false
  }
}

function parse(text: string): ClientMessage | null {
  try {
    const message = JSON.parse(text) as unknown
    return typeof message === 'object' && message !== null
      ? (message as ClientMessage)
      : null
  } catch {
    return null
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}
