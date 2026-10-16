import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { version } from '@/shared/version'

import { apiRoutes } from './routes/api'
import { frameRoutes } from './routes/frames'

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost'])

/**
 * True for `127.0.0.1` or `localhost` on the port the server bound, the only
 * hosts the board answers. The frame route reads the developer's files, so a
 * page on another origin reaching this port through DNS rebinding is refused.
 */
export function isBoardHost(host: string, port: number): boolean {
  let url: URL
  try {
    url = new URL(`http://${host}`)
  } catch {
    return false
  }
  return LOOPBACK_NAMES.has(url.hostname) && Number(url.port) === port
}

export interface AppOptions {
  /** The built client folder, holding `index.html` and its assets. */
  clientDir: string
  /** The absolute realpath of the board folder this server shows. */
  root: string
  /** The port the server bound, read per request since it is known only once listening. */
  port: () => number
}

export function createApp({ clientDir, root, port }: AppOptions): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    await next()
    c.header('x-frameboard-version', version)
  })
  app.use('*', async (c, next) => {
    if (!isBoardHost(new URL(c.req.url).host, port())) {
      return c.text('Forbidden host', 403)
    }
    await next()
  })
  // A second serve reads the root back to tell this board's server from another.
  app.get('/api/health', (c) => c.json({ version, root }))
  app.route('/', apiRoutes(root))
  app.route('/', frameRoutes(root))
  app.use('*', serveStatic({ root: clientDir }))

  return app
}
