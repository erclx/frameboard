import { Hono } from 'hono'

import { refuseClaimed } from '@/server/claims/gate'
import type { History } from '@/server/history/stack'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal } from './envelope'

/**
 * Undo and redo of the board's own writes, behind `requireWriter`. Each
 * answers the page to show and the frames the step touched, and refuses with
 * `undo-overtaken` when an agent changed what the step would write, or
 * `frame-claimed`, keeping the step, while another session holds what it names.
 */
export function historyRoutes(access: Access, history: History): Hono {
  const app = new Hono()
  const authorized = requireWriter(access)

  const unclaimed = (refs: string[]) =>
    refuseClaimed(history.root, refs, new Date())

  app.post('/api/undo', authorized, async (c) =>
    c.json({ ok: true, data: await history.undo(unclaimed) }),
  )
  app.post('/api/redo', authorized, async (c) =>
    c.json({ ok: true, data: await history.redo(unclaimed) }),
  )

  app.onError(answerRefusal)

  return app
}
