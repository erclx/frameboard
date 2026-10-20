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

  app.post('/api/undo', authorized, async (c) => {
    await refuseClaimed(history.root, history.peek('undo'), new Date())
    return c.json({ ok: true, data: await history.undo() })
  })
  app.post('/api/redo', authorized, async (c) => {
    await refuseClaimed(history.root, history.peek('redo'), new Date())
    return c.json({ ok: true, data: await history.redo() })
  })

  app.onError(answerRefusal)

  return app
}
