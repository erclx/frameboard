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

import { isBoardHost } from '../app'
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
  /** The board as it stands, sent to a board client on its hello. */
  snapshot: () => Promise<ListResult>
  /** Every frame's check findings, sent on a hello after the board. */
  findings?: () => Promise<Record<string, Finding[]>>
}

/**
 * The live socket every board tab holds. A client opens with a hello naming
 * its role, and only a `board` client counts as an open tab and receives the
 * board's messages.
 */
export function createHub({
  tabs,
  port,
  snapshot,
  findings,
}: HubOptions): LiveHub {
  const server = new WebSocketServer({ noServer: true })
  const boards = new Set<WebSocket>()

  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      if (boards.has(socket) || !isBoardHello(String(data))) return
      boards.add(socket)
      tabs.open()
      void snapshot()
        .then(async (board) => {
          send(socket, { type: 'board', data: board })
          if (findings) {
            send(socket, { type: 'findings', findings: await findings() })
          }
        })
        .catch(() => {})
    })
    socket.on('close', () => {
      if (boards.delete(socket)) tabs.close()
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
      for (const socket of boards) send(socket, message)
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

function isBoardHello(text: string): boolean {
  try {
    const message = JSON.parse(text) as Partial<ClientMessage>
    return message.type === 'hello' && message.role === 'board'
  } catch {
    return false
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}
