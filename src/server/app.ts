import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type MiddlewareHandler } from 'hono'

import { version } from '@/shared/version'

import type { Tickets } from './access/tickets'
import type { AssetUsage } from './board/asset-usage'
import type { RenderFrame } from './capture/render'
import type { ThumbnailStore } from './capture/thumbnails'
import type { History } from './history/stack'
import type { MeasureFrame } from './live/hug'
import type { SelectionHolder } from './live/selection'
import type { Delivery } from './notes/delivery'
import type { Dispatch } from './notes/dispatch'
import { accessRoutes } from './routes/access'
import { apiRoutes, type BoardActions } from './routes/api'
import { assetsRoutes } from './routes/assets'
import { type BrowserChecks, checkRoutes } from './routes/checks'
import { editRoutes, type SettledVersion } from './routes/edit'
import { elementsRoutes } from './routes/elements'
import { findRoutes } from './routes/find'
import type { FrameVersion } from './routes/frames'
import { historyRoutes } from './routes/history'
import { servedFrames } from './routes/look'
import { notesRoutes } from './routes/notes'
import { pngRoutes } from './routes/png'
import { structureRoutes } from './routes/structure'
import { thumbnailRoutes } from './routes/thumbnails'
import { tokenRoutes } from './routes/tokens'

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
  /** Mounts `GET /api/access/open`, which hands any local browser a writing tab. */
  openRoute?: boolean
  /** Renders a frame for `GET /api/frames/png`. */
  renderFrame: RenderFrame
  /** The folder holding the faces every frame imports. */
  facesDir: string
  /** The `--tokens` sheet standing in for the board's `tokens.css`, when given. */
  tokens?: string
  /** The listener registry a note write offers its queue to. */
  delivery?: Delivery
  /** Starts a session for a note, absent where `serve` holds no command. */
  dispatch?: Dispatch
  /** The undo history the board's structure and box writes record into. */
  history: History
  /** What the writing tab last selected, which `GET /api/selection` answers. */
  selection: SelectionHolder
  /** The warm checker `POST /api/checks` reads, absent where nothing runs one. */
  checks?: BrowserChecks
  /** The home view's captures `GET /api/thumbnails` reads, absent where nothing renders them. */
  thumbnails?: ThumbnailStore
  /** Reads a frame's content on the warm browser for `POST /api/frame/fit`. */
  measure?: MeasureFrame
  /** The frame versions agent writes replaced, which `?at=<hash>` serves. */
  frameVersion?: FrameVersion
  /** The same lookup, read after any watch batch in progress, which the edit route relocates a stale edit from. */
  settledVersion?: SettledVersion
  /** Counts the frames linking each asset, which the assets listing carries when given. */
  assetUsage?: AssetUsage
}

export function createApp({
  clientDir,
  root,
  port,
  actions,
  tickets,
  openRoute,
  renderFrame,
  facesDir,
  tokens,
  delivery,
  dispatch,
  history,
  selection,
  checks,
  thumbnails,
  measure,
  frameVersion,
  settledVersion,
  assetUsage,
}: AppOptions): Hono {
  const app = new Hono()
  // The server knows its own sheet, so it never reads the address file for it.
  const given = tokens ?? null

  app.use('*', async (c, next) => {
    await next()
    c.header('x-frameboard-version', version)
  })
  app.use('*', boardHostGuard(port))
  const frames = servedFrames(root, {
    facesDir,
    tokens: given,
    version: frameVersion,
  })

  // A second serve reads the root back to tell this board's server from
  // another, and the sheet to report the one this server was started with.
  app.get('/api/health', (c) => c.json({ version, root, tokens: given }))
  app.route('/', accessRoutes(actions.access, tickets, { openRoute }))
  app.route('/', apiRoutes(root, actions, frames.look, history))
  app.route('/', structureRoutes(root, actions.access, history, measure, given))
  app.route('/', historyRoutes(actions.access, history))
  app.route('/', notesRoutes(root, actions.access, delivery, dispatch))
  app.route('/', assetsRoutes(root, actions.access, { usage: assetUsage }))
  app.route('/', elementsRoutes(root, actions.access, selection, given))
  app.route('/', findRoutes(root))
  app.route('/', tokenRoutes(root, actions.access, history, frames.look))
  app.route(
    '/',
    editRoutes(
      root,
      actions.access,
      history,
      settledVersion,
      frames.look.sheets,
    ),
  )
  app.route('/', pngRoutes(root, renderFrame))
  if (checks) app.route('/', checkRoutes(actions.access, checks))
  if (thumbnails) app.route('/', thumbnailRoutes(root, thumbnails))
  app.route('/', frames.routes)
  app.use('*', serveStatic({ root: clientDir }))
  // A board route reloaded in the browser gets the client, which routes it.
  app.get(
    '/p/*',
    serveStatic({ root: clientDir, rewriteRequestPath: () => '/index.html' }),
  )

  return app
}
