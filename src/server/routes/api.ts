import { Hono } from 'hono'

import { scanBoard } from '@/server/board/scan'

/** The board's JSON API, each route answering in the CLI's `{ ok, data }` envelope. */
export function apiRoutes(root: string): Hono {
  const app = new Hono()

  app.get('/api/board', async (c) =>
    c.json({ ok: true, data: await scanBoard(root) }),
  )

  return app
}
