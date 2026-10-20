import { Hono } from 'hono'

import { findInProject } from '@/server/edit/find'
import { FrameboardError } from '@/shared/errors'
import type { FindResult } from '@/shared/records/find'

import { answerRefusal } from './envelope'

/** Longer than any name or line of copy anyone types into the field. */
const MAX_QUERY = 200

/**
 * `GET /api/find?project=&q=` answers the `find` record over the project's
 * frame files, so a frame culled offscreen or on another page is found like
 * any other. It only reads, so it takes no writer guard.
 */
export function findRoutes(root: string): Hono {
  const app = new Hono()

  app.get('/api/find', async (c) => {
    const project = c.req.query('project')
    if (!project) {
      throw new FrameboardError('usage', 'Name the project as ?project=.')
    }
    const query = c.req.query('q') ?? ''
    if (query.length > MAX_QUERY) {
      throw new FrameboardError('usage', `Keep ?q= to ${MAX_QUERY} characters.`)
    }
    const data: FindResult = await findInProject(root, project, query)
    return c.json({ ok: true, data })
  })

  app.onError(answerRefusal)

  return app
}
