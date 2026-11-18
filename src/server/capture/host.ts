import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { Browser } from 'playwright-core'

import { boardHostGuard } from '@/server/app'
import { servedFrames } from '@/server/routes/look'

import { launchCaptureBrowser } from './browser'

const HOSTNAME = '127.0.0.1'

export interface FrameHost {
  /** `http://127.0.0.1:<port>`, the origin every frame URL is loaded against. */
  url: string
  close: () => Promise<void>
}

export interface FrameHostOptions {
  /** The board folder whose frames it serves. */
  root: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
}

/**
 * Serves frames on a loopback port for a verb with no server running, through
 * the server's own routes, so a capture sees what the board shows.
 */
export async function startFrameHost({
  root,
  facesDir,
}: FrameHostOptions): Promise<FrameHost> {
  let bound = 0
  const app = new Hono()
  app.use(
    '*',
    boardHostGuard(() => bound),
  )
  app.route('/', servedFrames(root, { facesDir }).routes)

  const server = await new Promise<Server>((resolve, reject) => {
    const created = serve(
      { fetch: app.fetch, hostname: HOSTNAME, port: 0 },
      (info: AddressInfo) => {
        bound = info.port
        resolve(created as Server)
      },
    )
    created.once('error', reject)
  })

  return {
    url: `http://${HOSTNAME}:${bound}`,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
        // The browser's keep-alive connections would hold close open.
        server.closeAllConnections()
      }),
  }
}

/**
 * Runs `run` with a capture browser and a frame host over a board, closing
 * both however it ends. `purpose` names the verb in a `browser-not-found`.
 */
export async function withFrameHost<T>(
  board: FrameHostOptions,
  purpose: string,
  run: (browser: Browser, baseUrl: string) => Promise<T>,
): Promise<T> {
  const host = await startFrameHost(board)
  try {
    const browser = await launchCaptureBrowser({ purpose })
    try {
      return await run(browser, host.url)
    } finally {
      await browser.close()
    }
  } finally {
    await host.close()
  }
}
