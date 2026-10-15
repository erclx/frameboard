import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { version } from '@/shared/version'

export interface AppOptions {
  /** The built client folder, holding `index.html` and its assets. */
  clientDir: string
}

export function createApp({ clientDir }: AppOptions): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    await next()
    c.header('x-frameboard-version', version)
  })
  app.use('*', serveStatic({ root: clientDir }))

  return app
}
