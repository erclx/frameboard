import { EventEmitter, once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'

import { createApp } from './app'
import { scanBoard } from './board/scan'
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
 * The board tabs holding a live connection to this server. The route a tab
 * connects through calls `open` and `close`, and `serve` waits on it before
 * deciding to open a tab of its own.
 */
export class BoardTabs {
  #count = 0
  readonly #events = new EventEmitter()

  get count(): number {
    return this.#count
  }

  open(): void {
    this.#count += 1
    this.#events.emit('open')
  }

  close(): void {
    this.#count = Math.max(0, this.#count - 1)
  }

  /** True once a tab is connected, false when none connects within `ms`. */
  async waitForOne(ms: number): Promise<boolean> {
    if (this.#count > 0) return true
    try {
      await once(this.#events, 'open', { signal: AbortSignal.timeout(ms) })
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
  let bound = 0
  let token: string | null = null
  const boundPort = () => bound
  // Scans run one at a time, so a slow scan never lands after a newer one and
  // sends a board older than the last.
  let scanning: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const run = scanning.then(task)
    scanning = run.catch(() => {})
    return run
  }
  const hub = createHub({
    tabs,
    port: boundPort,
    snapshot: () => inTurn(() => scanBoard(root)),
  })
  const app = createApp({
    clientDir,
    root,
    port: boundPort,
    actions: {
      token: () => token,
      // A running server's tabs have long since reconnected, so it waits for none.
      open: () =>
        openBoard({
          tabs,
          url: `http://${HOSTNAME}:${bound}`,
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

  const watcher = await watchBoard(root)
  watcher.onBatch((paths) => void inTurn(() => pushBatch(root, paths, hub)))

  return {
    hostname: HOSTNAME,
    port: bound,
    tabs,
    watcher,
    authorize: (next) => {
      token = next
    },
    close: async () => {
      await Promise.all([watcher.close(), hub.close()])
      await new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
        // A tab's keep-alive connection would hold close open indefinitely.
        server.closeAllConnections()
      })
    },
  }
}

/** One rescan per batch: the whole board to every tab, then the frames to reload. */
async function pushBatch(
  root: string,
  paths: string[],
  hub: LiveHub,
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
}
