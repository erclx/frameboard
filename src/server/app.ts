import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type MiddlewareHandler } from 'hono'

import { version } from '@/shared/version'

import type { Tickets } from './access/tickets'
import type { RenderFrame } from './capture/render'
import { accessRoutes } from './routes/access'
import { apiRoutes, type BoardActions } from './routes/api'
import { servedFrames } from './routes/look'
import { pngRoutes } from './routes/png'

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

/** Refuses any request whose `Host` is not this server's loopback address. */
export function boardHostGuard(port: () => number): MiddlewareHandler {
  return async (c, next) => {
    if (!isBoardHost(new URL(c.req.url).host, port())) {
      return c.text('Forbidden host', 403)
    }
    await next()
  }
}

export interface AppOptions {
  /** The built client folder, holding `index.html` and its assets. */
  clientDir: string
  /** The absolute realpath of the board folder this server shows. */
  root: string
  /** The port the server bound, read per request since it is known only once listening. */
  port: () => number
  /** What the API's write routes do. */
  actions: BoardActions
  /** The single-use tickets the redeem route trades for the board's cookie. */
  tickets: Tickets
  /** Renders a frame for `GET /api/frames/png`. */
  renderFrame: RenderFrame
  /** The folder holding the faces every frame imports. */
  facesDir: string
  /** The `--tokens` sheet standing in for the board's `tokens.css`, when given. */
  tokens?: string
}

export function createApp({
  clientDir,
  root,
  port,
  actions,
  tickets,
  renderFrame,
  facesDir,
  tokens,
}: AppOptions): Hono {
  const app = new Hono()
  // The server knows its own sheet, so it never reads the address file for it.
  const given = tokens ?? null

  app.use('*', async (c, next) => {
    await next()
    c.header('x-frameboard-version', version)
  })
  app.use('*', boardHostGuard(port))
  const frames = servedFrames(root, { facesDir, tokens: given })

  // A second serve reads the root back to tell this board's server from
  // another, and the sheet to report the one this server was started with.
  app.get('/api/health', (c) => c.json({ version, root, tokens: given }))
  app.route('/', accessRoutes(actions.access, tickets))
  app.route('/', apiRoutes(root, actions, frames.look))
  app.route('/', pngRoutes(root, renderFrame))
  app.route('/', frames.routes)
  app.use('*', serveStatic({ root: clientDir }))
  // A board route reloaded in the browser gets the client, which routes it.
  app.get(
    '/p/*',
    serveStatic({ root: clientDir, rewriteRequestPath: () => '/index.html' }),
  )

  return app
}
