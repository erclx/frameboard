import { serve } from '@hono/node-server'

import { createApp } from './app'

export interface StartOptions {
  clientDir: string
  port: number
}

export interface RunningServer {
  close: () => Promise<void>
}

export function startServer({
  clientDir,
  port,
}: StartOptions): Promise<RunningServer> {
  const app = createApp({ clientDir })

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port }, () => {
      resolve({
        close: () =>
          new Promise((done, fail) =>
            server.close((error) => (error ? fail(error) : done())),
          ),
      })
    })
    server.once('error', reject)
  })
}
