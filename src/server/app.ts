import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { version } from '@/shared/version'

export interface AppOptions {
  /** The built client folder, holding `index.html` and its assets. */
  clientDir: string
  /** The absolute realpath of the board folder this server shows. */
  root: string
}

export function createApp({ clientDir, root }: AppOptions): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    await next()
    c.header('x-frameboard-version', version)
  })
  // A second serve reads the root back to tell this board's server from another.
  app.get('/api/health', (c) => c.json({ version, root }))
  app.use('*', serveStatic({ root: clientDir }))

  return app
}
