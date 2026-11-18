import { Hono } from 'hono'
import { z } from 'zod'

import { releaseReservation } from '@/server/claims/store'
import { FrameboardError } from '@/shared/errors'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'

const ReleaseBody = z.object({ frame: z.string().min(1) })

/**
 * `POST /api/claims/release`, dropping a frame's reservation whichever session
 * holds it, and never an editing claim.
 */
export function claimsRoutes(root: string, access: Access): Hono {
  const app = new Hono()
  app.onError(answerRefusal)
  app.use('/api/claims/release', requireWriter(access))

  app.post('/api/claims/release', async (c) => {
    const { frame } = await parseBody(c.req.raw, ReleaseBody)
    const released = await releaseReservation(root, frame, new Date())
    if (!released) {
      throw new FrameboardError(
        'frame-not-found',
        `No reservation holds ${frame}.`,
        { frame },
      )
    }
    return c.json({ ok: true, data: { released } })
  })

  return app
}
