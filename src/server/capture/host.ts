import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { Browser } from 'playwright-core'

import { boardHostGuard } from '@/server/app'
import { frameRoutes } from '@/server/routes/frames'

import { launchCaptureBrowser } from './browser'

const HOSTNAME = '127.0.0.1'

export interface FrameHost {
  /** `http://127.0.0.1:<port>`, the origin every frame URL is loaded against. */
  url: string
  close: () => Promise<void>
}

/**
 * Serves the board's frames on a loopback port of its own, for a verb that
 * renders with no board server running. It mounts the same frame routes the
 * server does, so a capture sees the bytes the board shows.
 */
export async function startFrameHost(root: string): Promise<FrameHost> {
  let bound = 0
  const app = new Hono()
  app.use(
    '*',
    boardHostGuard(() => bound),
  )
  app.route('/', frameRoutes(root))

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
 * Runs `run` with a capture browser and a frame host over `root`, closing
 * both however it ends. `purpose` names the verb in a `browser-not-found`.
 */
export async function withFrameHost<T>(
  root: string,
  purpose: string,
  run: (browser: Browser, baseUrl: string) => Promise<T>,
): Promise<T> {
  const host = await startFrameHost(root)
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
