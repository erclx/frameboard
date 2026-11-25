import { liveIframe, stampRenderedAt } from '@/client/board/frame-dom'
import {
  awaitingHash,
  forgetLiveHashes,
  renameSelection,
  type SelectionStore,
  selectionStore,
  takeLiveHash,
  whenSettled,
} from '@/client/board/selection'
import {
  renameFlipped,
  type ThemeStore,
  themeStore,
} from '@/client/theme/store'
import { takesRename } from '@/shared/board-sync/rename'
import { FACES, FACES_URL } from '@/shared/faces'
import {
  type HelloMessage,
  LIVE_PATH,
  type ServerMessage,
} from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'

import { otherLoopback } from './frame-url'
import {
  type LiveStore,
  receiveAccess,
  receiveBoard,
  receiveClaims,
  receiveDisconnect,
  receiveFindings,
  receiveFrames,
  receiveHistory,
  receiveListeners,
  receiveNotes,
  receiveReload,
  receiveRename,
  receiveThumbnails,
} from './store'
import {
  pruneUnseen,
  receiveChanges,
  renameUnseen,
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

/** How long the other loopback name has to answer before frames keep the tab's own. */
const REACH_MS = 1000

/** A small file the frame port always serves, named with no release so a tab older than the server still reads it. */
const REACH_PATH = `${FACES_URL}/${FACES[0].folder}/index.css`

export interface LiveHandlers {
  /** A `show` message, which the router turns into a navigation. */
  onShow?: (ref: string) => void
  /** The socket closing, which ends anything waiting on a message from it. */
  onDisconnect?: () => void
  /** Where an agent's changes go, the app's own store unless a test stands in. */
  unseen?: UnseenStore
  /** The selection a rename moves, the app's own unless a test stands in. */
  selection?: SelectionStore
  /** The flipped frames a rename moves, the app's own unless a test stands in. */
  theme?: ThemeStore
}

/**
 * Holds the board's live socket open, saying hello on every open and trying
 * again every 500 ms while closed, so a restarted server finds its tab again.
 * Returns the function that closes it for good.
 */
export function connectLive(
  store: LiveStore,
  {
    onShow,
    onDisconnect,
    unseen = unseenStore,
    selection = selectionStore,
    theme = themeStore,
  }: LiveHandlers = {},
): () => void {
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let hellos = 0

  const settleFrames = async (port: number) => {
    hellos += 1
    const hello = hellos
    // A dropped socket hands back the same port, whose frames a slow answer would reload.
    if (store.getState().framePort === port) return
    const host = await frameHostFor(port)
    if (hello === hellos && !stopped) receiveFrames(store, port, host)
  }

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
      if (message.type === 'frames') {
        void settleFrames(message.port)
      } else if (message.type === 'board') {
        receiveBoard(store, message.data)
        pruneUnseen(unseen, message.data)
      } else if (message.type === 'changes') {
        receiveChanges(unseen, message.changes)
        const { board } = store.getState()
        // A replayed change can name a frame the board already lost.
        if (board) pruneUnseen(unseen, board)
      } else if (message.type === 'access') {
        receiveAccess(
          store,
          message.write,
          message.dispatch,
          message.editButton,
        )
      } else if (message.type === 'reload') {
        receiveLiveReload(store, message.refs, message.hashes)
      } else if (message.type === 'renamed') {
        const { before, after } = message
        const { board } = store.getState()
        // Moved first, since the renamed board prunes a selection it no longer holds.
        if (board && takesRename(board, before, after)) {
          renameSelection(selection, before, after)
          renameFlipped(before, after, theme)
          renameUnseen(unseen, before, after)
          receiveRename(store, before, after)
        }
      } else if (message.type === 'findings') {
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

/**
 * The hostname to load frames from on `port`, being the other loopback name
 * where it answers, and the tab's own where it does not or there is none.
 */
async function frameHostFor(port: number): Promise<string> {
  const own = location.hostname
  const other = otherLoopback(own)
  if (other === null) return own
  try {
    const response = await fetch(`http://${other}:${port}${REACH_PATH}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REACH_MS),
    })
    return response.ok ? other : own
  } catch {
    return own
  }
}

/**
 * Reloads the named frames, skipping one already showing this tab's own write,
 * a write in flight decided once it settles, and any doubt reloading.
 */
export function receiveLiveReload(
  store: LiveStore,
  refs: readonly string[],
  hashes: Readonly<Record<string, string>> = {},
): void {
  const waiting = refs.filter((ref) => ref in hashes && awaitingHash(ref))
  const now = refs.filter((ref) => !waiting.includes(ref))
  settleReload(store, now, hashes)
  for (const ref of waiting) {
    void whenSettled(ref).then(() => settleReload(store, [ref], hashes))
  }
}

function settleReload(
  store: LiveStore,
  refs: readonly string[],
  hashes: Readonly<Record<string, string>>,
): void {
  if (refs.length === 0) return
  const kept = refs.filter((ref) => {
    const hash = hashes[ref]
    if (hash !== undefined && takeLiveHash(ref, hash)) return true
    // The page now shows the file, so no earlier live bytes may be skipped to.
    forgetLiveHashes(ref)
    return false
  })
  // A drag begun since keeps its own previews for Esc to put back.
  for (const ref of kept) {
    const iframe = liveIframe(ref)
    const modifiedAt = frameOf(store.getState().board, ref)?.modifiedAt
    if (iframe && modifiedAt) stampRenderedAt(iframe, modifiedAt)
  }
  receiveReload(store, refs, kept)
}

function frameOf(board: ListResult | null, ref: string) {
  return board?.projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .find((frame) => frame.ref === ref)
}
