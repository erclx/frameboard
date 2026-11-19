import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { boardHostGuard } from '@/server/app'
import type { FrameVersion } from '@/server/routes/frames'
import { servedFrames } from '@/server/routes/look'

const HOSTNAME = '127.0.0.1'

/**
 * Lets a frame page sit in the board on either loopback name and any port,
 * which covers the board's own port and Vite's in dev, and no foreign page.
 */
export const FRAME_ANCESTORS =
  "frame-ancestors 'self' http://127.0.0.1:* http://localhost:*"

const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/

export interface FrameOriginOptions {
  /** The absolute realpath of the board folder. */
  root: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
  /** The `--tokens` sheet standing in for the board's `tokens.css`, when given. */
  tokens?: string | null
  /** The frame versions agent writes replaced, which `?at=<hash>` serves. */
  version?: FrameVersion
}

/**
 * The frames, their assets, and the look on an origin apart from the board's,
 * so a frame's script carries an `Origin` the board's write guard refuses.
 * It answers GET and HEAD under the frame and look routes alone.
 */
export function frameOriginApp(
  port: () => number,
  { root, facesDir, tokens, version }: FrameOriginOptions,
): Hono {
  const app = new Hono()
  app.use('*', boardHostGuard(port))
  app.use('*', async (c, next) => {
    await next()
    const type = c.res.headers.get('Content-Type') ?? ''
    if (type.startsWith('text/html') || type.startsWith('image/svg+xml')) {
      c.res.headers.set('Content-Security-Policy', FRAME_ANCESTORS)
    }
    // Any loopback page can embed these files already, so reading them from
    // the board's page grants nothing new, and no credential is allowed.
    const origin = c.req.header('Origin')
    if (origin !== undefined && LOOPBACK_ORIGIN.test(origin)) {
      c.res.headers.set('Access-Control-Allow-Origin', origin)
    }
    c.res.headers.append('Vary', 'Origin')
  })
  app.route(
    '/',
    servedFrames(root, { facesDir, tokens: tokens ?? null, version }).routes,
  )
  return app
}

export interface FrameOrigin {
  /** The port the frame listener bound, a free one on every start. */
  port: number
  /** Stops the listener and drops every open connection. */
  close: () => Promise<void>
}

/** Starts the frame listener on a free loopback port. */
export async function startFrameOrigin(
  options: FrameOriginOptions,
): Promise<FrameOrigin> {
  let bound = 0
  const app = frameOriginApp(() => bound, options)
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
    port: bound,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
        // A tab's keep-alive connection would hold close open indefinitely.
        server.closeAllConnections()
      }),
  }
}
