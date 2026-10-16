import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { version } from '@/shared/version'

import { apiRoutes } from './routes/api'
import { frameRoutes } from './routes/frames'

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost'])

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
  // The frame route reads the developer's files, so a page on another origin
  // reaching this port through DNS rebinding must be refused.
  app.use('*', async (c, next) => {
    const url = new URL(c.req.url)
    if (!LOOPBACK_NAMES.has(url.hostname) || Number(url.port) !== port()) {
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
