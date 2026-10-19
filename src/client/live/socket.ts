import {
  type HelloMessage,
  LIVE_PATH,
  type ServerMessage,
} from '@/shared/live-messages'

import {
  type LiveStore,
  receiveAccess,
  receiveBoard,
  receiveDisconnect,
  receiveFindings,
  receiveListeners,
  receiveNotes,
  receiveReload,
} from './store'

/** How long a closed socket waits before trying again. */
const RECONNECT_MS = 500

export interface LiveHandlers {
  /** A `show` message, which the router turns into a navigation. */
  onShow?: (ref: string) => void
}

/**
 * Holds the board's live socket open, saying hello on every open and trying
 * again every 500 ms while closed, so a restarted server finds its tab again.
 * Returns the function that closes it for good.
 */
export function connectLive(
  store: LiveStore,
  { onShow }: LiveHandlers = {},
): () => void {
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const open = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}${LIVE_PATH}`)
    socket.addEventListener('open', () => {
      const hello: HelloMessage = { type: 'hello', role: 'board' }
      socket?.send(JSON.stringify(hello))
      store.setState({ connected: true })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage
      if (message.type === 'board') receiveBoard(store, message.data)
      else if (message.type === 'access') receiveAccess(store, message.write)
      else if (message.type === 'reload') receiveReload(store, message.refs)
      else if (message.type === 'findings') {
        receiveFindings(store, message.findings)
      } else if (message.type === 'notes') {
        receiveNotes(store, message.page, message.notes)
      } else if (message.type === 'listeners') {
        receiveListeners(store, message.listeners)
      } else if (message.type === 'show') onShow?.(message.ref)
    })
    socket.addEventListener('close', () => {
      receiveDisconnect(store)
      if (!stopped) retry = setTimeout(open, RECONNECT_MS)
    })
  }

  open()
  return () => {
    stopped = true
    clearTimeout(retry)
    socket?.close()
  }
}
