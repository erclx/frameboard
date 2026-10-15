import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'

import { createApp } from './app'

// Loopback only: the board serves the operator's own files, so it stays off the LAN.
const HOSTNAME = '127.0.0.1'

export interface StartOptions {
  clientDir: string
  port: number
}

export interface RunningServer {
  hostname: string
  /** The port actually bound, which differs from the requested one when that was 0. */
  port: number
  close: () => Promise<void>
}

export function startServer({
  clientDir,
  port,
}: StartOptions): Promise<RunningServer> {
  const app = createApp({ clientDir })

  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, hostname: HOSTNAME, port },
      (info: AddressInfo) => {
        resolve({
          hostname: HOSTNAME,
          port: info.port,
          close: () =>
            new Promise((done, fail) =>
              server.close((error) => (error ? fail(error) : done())),
            ),
        })
      },
    )
    server.once('error', reject)
  })
}
