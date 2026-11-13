import { Hono } from 'hono'
import { z } from 'zod'

import { resolveFrameRef } from '@/server/board/refs'
import { networkAddress, previewLink } from '@/server/preview/address'
import type { PreviewSlot } from '@/server/preview/listener'
import { FrameboardError } from '@/shared/errors'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'

/** The port a phone link asks for first, which a machine's one-time route forwards. */
export const PREVIEW_PORT = 4400

const StartBody = z.object({
  ref: z.string().min(1),
  port: z.number().int().min(0).max(65535).optional(),
})

const StopBody = z.object({ token: z.string().min(1).optional() })

/**
 * `POST /api/preview` with `{ ref, port? }` starts the phone listener for the
 * frame's project and answers the link landing on that frame, ending any
 * link already open. `DELETE /api/preview` with `{ token? }` ends it, or only
 * the listener holding `token`. Both sit behind `requireWriter`, since a
 * start opens a port to the local network. A machine with no local network
 * address refuses `no-network-address` and starts nothing.
 */
export function previewRoutes(
  root: string,
  access: Access,
  slot: PreviewSlot,
  { address = networkAddress }: { address?: () => string | null } = {},
): Hono {
  const app = new Hono()
  app.onError((error, c) => {
    if (
      error instanceof FrameboardError &&
      error.code === 'no-network-address'
    ) {
      return c.json(
        {
          ok: false,
          error: { code: error.code, message: error.message, details: {} },
        },
        503,
      )
    }
    return answerRefusal(error, c)
  })
  app.use('/api/preview', requireWriter(access))

  app.post('/api/preview', async (c) => {
    const { ref, port = PREVIEW_PORT } = await parseBody(c.req.raw, StartBody)
    const frame = await resolveFrameRef(root, ref, { cwd: root })
    const host = address()
    if (host === null) {
      throw new FrameboardError(
        'no-network-address',
        'This machine has no address on a local network, so a phone cannot reach it. Join the Wi-Fi the phone is on and try again.',
      )
    }
    const listener = await slot.start(frame.project, port)
    return c.json({
      ok: true,
      data: {
        url: previewLink({
          address: host,
          port: listener.port,
          token: listener.token,
          project: frame.project,
          page: frame.page,
          frame: frame.name,
        }),
        address: host,
        port: listener.port,
        token: listener.token,
        project: frame.project,
        ref: `${frame.project}/${frame.page}/${frame.name}`,
      },
    })
  })

  app.delete('/api/preview', async (c) => {
    // A stop with no body ends whatever runs, as `--stop` sends it.
    const body: unknown = await c.req.json().catch(() => ({}))
    const parsed = StopBody.safeParse(body)
    if (!parsed.success) {
      throw new FrameboardError('usage', `The body ${parsed.error.message}`)
    }
    const stopped = await slot.stop(parsed.data.token)
    return c.json({ ok: true, data: { stopped } })
  })

  return app
}
