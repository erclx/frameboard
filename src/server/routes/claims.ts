import { Hono } from 'hono'
import { z } from 'zod'

import { releaseReservation } from '@/server/claims/store'
import { FrameboardError } from '@/shared/errors'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'

const ReleaseBody = z.object({ frame: z.string().min(1) })

/**
 * `POST /api/claims/release` with `{ frame }`, the canonical ref a claim
 * names, dropping the live reservation on that frame whichever session holds
 * it. It sits behind `requireWriter`, and a frame holding no reservation,
 * including one an agent holds an editing claim on, refuses
 * `frame-not-found` and is left as it was.
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
