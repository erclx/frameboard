import { EventEmitter, once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'

import { createApp } from './app'

// Loopback only: the board serves the operator's own files, so it stays off the LAN.
const HOSTNAME = '127.0.0.1'

export interface StartOptions {
  clientDir: string
  root: string
  port: number
  /** Fail on a taken port rather than falling back to one the OS assigns. */
  strictPort?: boolean
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

function listen({
  clientDir,
  root,
  port,
}: Omit<StartOptions, 'strictPort'>): Promise<RunningServer> {
  const tabs = new BoardTabs()
  let bound = 0
  const app = createApp({ clientDir, root, port: () => bound })

  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, hostname: HOSTNAME, port },
      (info: AddressInfo) => {
        bound = info.port
        resolve({
          hostname: HOSTNAME,
          port: info.port,
          tabs,
          close: () =>
            new Promise((done, fail) => {
              server.close((error) => (error ? fail(error) : done()))
              // A tab's keep-alive connection would hold close open indefinitely.
              ;(server as Server).closeAllConnections()
            }),
        })
      },
    )
    server.once('error', reject)
  })
}
