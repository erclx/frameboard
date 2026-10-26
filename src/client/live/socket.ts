import {
  type HelloMessage,
  LIVE_PATH,
  type ServerMessage,
} from '@/shared/live-messages'

import {
  type LiveStore,
  receiveAccess,
  receiveBoard,
  receiveClaims,
  receiveDisconnect,
  receiveFindings,
  receiveHistory,
  receiveListeners,
  receiveNotes,
  receiveReload,
  receiveThumbnails,
} from './store'
import {
  pruneUnseen,
  receiveChanges,
  type UnseenStore,
  unseenStore,
} from './unseen'

/**
 * This tab's id, which its hello and its selection reports carry, so the
 * server forgets a report once the tab that made it closes.
 */
export const TAB_ID = crypto.randomUUID()

/** How long a closed socket waits before trying again. */
const RECONNECT_MS = 500

export interface LiveHandlers {
  /** A `show` message, which the router turns into a navigation. */
  onShow?: (ref: string) => void
  /** The socket closing, which ends anything waiting on a message from it. */
  onDisconnect?: () => void
  /** Where an agent's changes go, the app's own store unless a test stands in. */
  unseen?: UnseenStore
}

/**
 * Holds the board's live socket open, saying hello on every open and trying
 * again every 500 ms while closed, so a restarted server finds its tab again.
 * Returns the function that closes it for good.
 */
export function connectLive(
  store: LiveStore,
  { onShow, onDisconnect, unseen = unseenStore }: LiveHandlers = {},
): () => void {
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const open = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}${LIVE_PATH}`)
    socket.addEventListener('open', () => {
      const hello: HelloMessage = { type: 'hello', role: 'board', tab: TAB_ID }
      socket?.send(JSON.stringify(hello))
      store.setState({ connected: true })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage
      if (message.type === 'board') {
        receiveBoard(store, message.data)
        pruneUnseen(unseen, message.data)
      } else if (message.type === 'changes') {
        receiveChanges(unseen, message.changes)
        const { board } = store.getState()
        // A replayed change can name a frame the board already lost.
        if (board) pruneUnseen(unseen, board)
      } else if (message.type === 'access') {
        receiveAccess(store, message.write, message.dispatch)
      } else if (message.type === 'reload') receiveReload(store, message.refs)
      else if (message.type === 'findings') {
        receiveFindings(store, message.findings)
      } else if (message.type === 'notes') {
        receiveNotes(store, message.page, message.notes)
      } else if (message.type === 'listeners') {
        receiveListeners(store, message.listeners)
      } else if (message.type === 'history') {
        receiveHistory(store, { undo: message.undo, redo: message.redo })
      } else if (message.type === 'claims') {
        receiveClaims(store, message.claims)
      } else if (message.type === 'thumbnails') {
        receiveThumbnails(store, message.theme, message.stamps)
      } else if (message.type === 'show') onShow?.(message.ref)
    })
    socket.addEventListener('close', () => {
      receiveDisconnect(store)
      onDisconnect?.()
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
