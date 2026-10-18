import { timingSafeEqual } from 'node:crypto'

import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { z } from 'zod'

import { readAuthor } from '@/server/author'
import { scanBoard } from '@/server/board/scan'

/** What the write routes do, handed in by the server that owns the tabs and the socket. */
export interface BoardActions {
  /** The token the write routes accept, null until the address file records one. */
  token: () => string | null
  /** Opens a browser tab when no board tab is connected, resolving whether it did. */
  open: () => Promise<boolean>
  /** Tells every board tab to show a frame, returning how many were told. */
  show: (ref: string) => number
}

const showBodySchema = z.object({ ref: z.string().min(1).max(1024) })

/**
 * The board's JSON API, each route answering in the CLI's `{ ok, data }`
 * envelope. The write routes need the address file's token, so a script
 * inside a frame, which shares the board's origin, cannot call them.
 */
export function apiRoutes(root: string, actions: BoardActions): Hono {
  const app = new Hono()
  const authorized = bearerAuth({
    verifyToken: (token) => matches(token, actions.token()),
  })

  app.get('/api/board', async (c) =>
    c.json({ ok: true, data: await scanBoard(root) }),
  )

  app.get('/api/author', async (c) =>
    c.json({ ok: true, data: { name: await readAuthor(root) } }),
  )

  app.post('/api/open', authorized, async (c) =>
    c.json({ ok: true, data: { opened: await actions.open() } }),
  )

  app.post('/api/show', authorized, async (c) => {
    const body = showBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json(
        {
          ok: false,
          error: { code: 'usage', message: 'Send { "ref": "<frame ref>" }.' },
        },
        400,
      )
    }
    const tabs = actions.show(body.data.ref)
    return c.json({ ok: true, data: { ref: body.data.ref, tabs } })
  })

  return app
}

function matches(given: string, expected: string | null): boolean {
  if (expected === null) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
