import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { BOARD_SHEET_URL } from '@/server/routes/frames'
import { servedFrames } from '@/server/routes/look'
import { FACES_URL } from '@/shared/faces'

/** Where every phone link starts, ahead of its token. */
const LINK_PREFIX = '/v/'

/** The bytes of a link's token, 96 bits, which keeps the code small. */
const TOKEN_BYTES = 12

export interface PreviewOptions {
  /** The absolute realpath of the board folder. */
  root: string
  /** The one project the link opens. */
  project: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
  /** The `--tokens` sheet standing in for the board's `tokens.css`, when given. */
  tokens?: string | null
}

/**
 * The phone link's read-only app: GET and HEAD under `/v/<token>/` for one
 * project's frames and assets at `frames/<project>/...` and the faces and
 * board sheet at `frameboard/...`, each answered by the board's own frame and
 * look routes, so their refusals of board records, dot-named paths, and
 * escaping paths hold here unrestated. Anything else answers 404, so nothing
 * tells a caller what exists. It carries no Host check, since a phone names
 * the machine's address, and the token is what keeps other pages out.
 */
export function previewApp(token: string, options: PreviewOptions): Hono {
  const base = `${LINK_PREFIX}${token}`
  const served = servedFrames(options.root, {
    facesDir: options.facesDir,
    tokens: options.tokens ?? null,
    base,
  }).routes
  const app = new Hono()

  // A frame's outbound link or asset would otherwise carry the token in its
  // Referer to whatever host it names.
  app.use('*', async (c, next) => {
    await next()
    c.res = withHeader(c.res, 'Referrer-Policy', 'no-referrer')
  })

  app.all('*', async (c) => {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD') return c.notFound()
    // The URL parser has already resolved `..` and `%2e%2e` segments.
    const url = new URL(c.req.url)
    const inner = innerPath(url.pathname, token, options.project)
    if (inner === null) return c.notFound()

    const headers = new Headers()
    for (const name of ['range', 'if-none-match']) {
      const value = c.req.header(name)
      if (value !== undefined) headers.set(name, value)
    }
    // A query is the theme a frame opens in, never `?at=`, which names a
    // replaced version the phone has no business reading.
    const theme = url.searchParams.get('theme')
    const query = theme === null ? '' : `?${new URLSearchParams({ theme })}`
    return served.fetch(
      new Request(`http://preview${inner}${query}`, { method, headers }),
    )
  })

  return app
}

/**
 * The board path a phone path stands for, or null when it names another
 * token, another project, or anything outside the frames and the look.
 */
function innerPath(
  pathname: string,
  token: string,
  project: string,
): string | null {
  if (!pathname.startsWith(LINK_PREFIX)) return null
  const [given = '', ...rest] = pathname.slice(LINK_PREFIX.length).split('/')
  if (!sameToken(given, token)) return null
  const inner = `/${rest.join('/')}`

  if (inner === BOARD_SHEET_URL || inner.startsWith(`${FACES_URL}/`)) {
    return inner
  }
  const [area, named, ...within] = rest
  if (area !== 'frames' || within.length === 0) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(named ?? '')
  } catch {
    return null
  }
  return decoded === project ? inner : null
}

/** The response with one header set, copied first since a forwarded one may be immutable. */
function withHeader(response: Response, name: string, value: string): Response {
  const headers = new Headers(response.headers)
  headers.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function sameToken(given: string, token: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface PreviewListener {
  /** The secret in every link this listener answers, new on each start. */
  token: string
  /** The local network address the listener bound, the one the link names. */
  host: string
  /** The port the listener bound, the one asked for unless it was taken. */
  port: number
  /** The project the link opens. */
  project: string
  /** Stops the listener and drops every open connection, so no link answers after. */
  close: () => Promise<void>
}

/**
 * Starts the phone listener on `host`, the machine's local network address,
 * at `port`, or on a free port when that one is taken, with a fresh token.
 * Binding the one address rather than every interface keeps the listener off
 * any other network the machine sits on. The board's own listener is
 * untouched, staying on loopback behind its Host check.
 */
export async function startPreviewListener(
  options: PreviewOptions & { host: string; port: number },
): Promise<PreviewListener> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const app = previewApp(token, options)
  let server: Server
  try {
    server = await bind(app, options.host, options.port)
  } catch (error) {
    const taken = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    if (!taken || options.port === 0) throw error
    server = await bind(app, options.host, 0)
  }
  const { port } = server.address() as AddressInfo
  return {
    token,
    host: options.host,
    port,
    project: options.project,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        // A phone's keep-alive connection would hold close open indefinitely.
        server.closeAllConnections()
      }),
  }
}

function bind(app: Hono, hostname: string, port: number): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const created = serve({ fetch: app.fetch, hostname, port }, () =>
      resolve(created as Server),
    )
    created.once('error', reject)
  })
}

/** The one phone listener a board holds at a time, so a new link ends the last. */
export interface PreviewSlot {
  /** Ends any listener running, then starts one for `project` on `host`, with a new token. */
  start: (
    project: string,
    host: string,
    port: number,
  ) => Promise<PreviewListener>
  /**
   * Ends the running listener, or only the one holding `token` when given, so
   * a card closing in one tab leaves a link another tab opened since. True
   * when a listener ended.
   */
  stop: (token?: string) => Promise<boolean>
}

/**
 * Holds the board's phone listener, running each start and stop in turn so
 * two never race to bind. The board ends it with `stop()` as it closes.
 */
export function createPreviewSlot(
  options: Omit<PreviewOptions, 'project'>,
): PreviewSlot {
  let running: PreviewListener | null = null
  let turn: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next = turn.then(work, work)
    turn = next.catch(() => undefined)
    return next
  }
  const end = async (token?: string): Promise<boolean> => {
    if (!running || (token !== undefined && running.token !== token)) {
      return false
    }
    const ending = running
    running = null
    await ending.close()
    return true
  }

  return {
    start: (project, host, port) =>
      inTurn(async () => {
        await end()
        running = await startPreviewListener({
          ...options,
          project,
          host,
          port,
        })
        return running
      }),
    stop: (token) => inTurn(() => end(token)),
  }
}
