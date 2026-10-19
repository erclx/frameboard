import { EventEmitter, once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'

import { type Access } from './access/guard'
import { cookieName, loadBoardKey } from './access/key'
import { createTickets } from './access/tickets'
import { createApp, isBoardHost } from './app'
import { scanBoard } from './board/scan'
import { launchCaptureBrowser } from './capture/browser'
import { createWarmRenderer } from './capture/render'
import { type BoardFindings, createBoardFindings } from './live/findings'
import { createHub, type LiveHub } from './live/hub'
import { openBoard } from './live/open-board'
import { type BoardWatcher, reloadRefs, watchBoard } from './live/watch'

// Loopback only: the board serves the operator's own files, so it stays off the LAN.
const HOSTNAME = '127.0.0.1'

export interface StartOptions {
  clientDir: string
  root: string
  port: number
  /** Fail on a taken port rather than falling back to one the OS assigns. */
  strictPort?: boolean
  /** Opens a browser tab, for a second `serve` asking this one to open the board. */
  openUrl: (url: string) => void
}

/**
 * The board tabs holding a live connection to this server, counting apart the
 * ones that can write. The route a tab connects through calls `open` and
 * `close`, and `serve` waits on a writer before deciding to open a tab of its
 * own, since a tab typed in by hand reads the board but cannot change it.
 */
export class BoardTabs {
  #count = 0
  #writers = 0
  readonly #events = new EventEmitter()

  get count(): number {
    return this.#count
  }

  get writers(): number {
    return this.#writers
  }

  open(writer: boolean): void {
    this.#count += 1
    if (writer) {
      this.#writers += 1
      this.#events.emit('writer')
    }
  }

  close(writer: boolean): void {
    this.#count = Math.max(0, this.#count - 1)
    if (writer) this.#writers = Math.max(0, this.#writers - 1)
  }

  /** True once a writing tab is connected, false when none connects within `ms`. */
  async waitForWriter(ms: number): Promise<boolean> {
    if (this.#writers > 0) return true
    try {
      await once(this.#events, 'writer', { signal: AbortSignal.timeout(ms) })
      return true
    } catch {
      return false
    }
  }
}

export interface RunningServer {
  hostname: string
  /** The port actually bound, which differs from the requested one when that was 0 or taken. */
  port: number
  tabs: BoardTabs
  /** The board folder's watcher, whose batches any later check can follow without a second one. */
  watcher: BoardWatcher
  /** Sets the token the write routes accept, once the address file records it. */
  authorize: (token: string) => void
  /** The board's address with a fresh single-use ticket, which a browser trades for the write cookie. */
  boardUrl: () => string
  close: () => Promise<void>
}

export async function startServer({
  strictPort = true,
  port,
  ...options
}: StartOptions): Promise<RunningServer> {
  try {
    return await listen({ ...options, port })
  } catch (error) {
    const taken = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    if (strictPort || !taken || port === 0) throw error
    return listen({ ...options, port: 0 })
  }
}

async function listen({
  clientDir,
  root,
  port,
  openUrl,
}: Omit<StartOptions, 'strictPort'>): Promise<RunningServer> {
  const tabs = new BoardTabs()
  const tickets = createTickets()
  let bound = 0
  let token: string | null = null
  const boundPort = () => bound
  const access: Access = {
    token: () => token,
    key: await loadBoardKey(root),
    cookieName: cookieName(root),
    isOwnOrigin: (host) => isBoardHost(host, bound),
  }
  const boardUrl = () =>
    `http://${HOSTNAME}:${bound}/api/access/redeem?ticket=${tickets.mint()}`
  // Scans run one at a time, so a slow scan never lands after a newer one and
  // sends a board older than the last.
  let scanning: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const run = scanning.then(task)
    scanning = run.catch(() => {})
    return run
  }
  const findings = createBoardFindings(root)
  const hub = createHub({
    tabs,
    port: boundPort,
    access,
    snapshot: () => inTurn(() => scanBoard(root)),
    findings: () => inTurn(async () => findings.all()),
  })
  // The board pays the browser launch once, on its first PNG.
  const renderer = createWarmRenderer({
    baseUrl: () => `http://${HOSTNAME}:${bound}`,
    launch: () => launchCaptureBrowser({ purpose: 'Copy frame as PNG' }),
  })
  const app = createApp({
    clientDir,
    root,
    port: boundPort,
    tickets,
    renderFrame: renderer.render,
    actions: {
      access,
      // A running server's tabs have long since reconnected, so it waits for none.
      open: () =>
        openBoard({
          tabs,
          url: boardUrl,
          open: openUrl,
          graceMs: 0,
        }),
      show: (ref) => {
        hub.broadcast({ type: 'show', ref })
        return tabs.count
      },
    },
  })

  const server = await new Promise<Server>((resolve, reject) => {
    const created = serve(
      { fetch: app.fetch, hostname: HOSTNAME, port },
      (info: AddressInfo) => {
        bound = info.port
        resolve(created as Server)
      },
    )
    created.once('error', reject)
  })
  server.on('upgrade', hub.handleUpgrade)

  // Every frame is checked once at start, ahead of any hello's findings.
  void inTurn(async () => findings.update(await scanBoard(root), 'all'))
  const watcher = await watchBoard(root)
  watcher.onBatch(
    (paths) => void inTurn(() => pushBatch(root, paths, hub, findings)),
  )

  return {
    hostname: HOSTNAME,
    port: bound,
    tabs,
    watcher,
    authorize: (next) => {
      token = next
    },
    boardUrl,
    close: async () => {
      await Promise.all([watcher.close(), hub.close(), renderer.close()])
      await new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
        // A tab's keep-alive connection would hold close open indefinitely.
        server.closeAllConnections()
      })
    },
  }
}

/**
 * One rescan per batch: the whole board to every tab, then the frames to
 * reload, then the findings of every frame the batch rechecked.
 */
async function pushBatch(
  root: string,
  paths: string[],
  hub: LiveHub,
  findings: BoardFindings,
): Promise<void> {
  let board
  try {
    board = await scanBoard(root)
  } catch {
    // A board folder mid-removal does not scan, and the next batch catches up.
    return
  }
  hub.broadcast({ type: 'board', data: board })
  const refs = reloadRefs(root, paths, board)
  if (refs.length > 0) hub.broadcast({ type: 'reload', refs })
  const changed = findings.update(board, paths)
  if (Object.keys(changed).length > 0) {
    hub.broadcast({ type: 'findings', findings: changed })
  }
}
