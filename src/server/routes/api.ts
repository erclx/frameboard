import { Hono } from 'hono'
import { z } from 'zod'

import { readAuthor } from '@/server/author'
import { scanBoard } from '@/server/board/scan'

import { type Access, requireWriter } from '../access/guard'

/** What the write routes do, handed in by the server that owns the tabs and the socket. */
export interface BoardActions {
  /** Who may call the write routes. */
  access: Access
  /** Opens a browser tab when no writing board tab is connected, resolving whether it did. */
  open: () => Promise<boolean>
  /** Tells every board tab to show a frame, returning how many were told. */
  show: (ref: string) => number
}

const showBodySchema = z.object({ ref: z.string().min(1).max(1024) })

/**
 * The board's JSON API, each route answering in the CLI's `{ ok, data }`
 * envelope. The write routes need a writer, being the address file's token or
 * the cookie of a tab `serve` opened, so a page on another origin cannot call them.
 */
export function apiRoutes(root: string, actions: BoardActions): Hono {
  const app = new Hono()
  const authorized = requireWriter(actions.access)

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
