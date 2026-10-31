import { Hono } from 'hono'
import { z } from 'zod'

import type { BrowserRun, Finding } from '@/shared/records/check'

import { type Access, requireWriter } from '../access/guard'

/** What the route reads off the server's warm checker and its held findings. */
export interface BrowserChecks {
  /**
   * Rescans the board and queues every frame whose file or box changed, and
   * takes in an agent's write to any of `refs`, so a write the watcher has not
   * batched yet is checked before the route answers.
   */
  refresh: (refs: string[]) => Promise<void>
  /**
   * Resolves once no recheck of any of `refs` is queued or running, and no
   * agent write to one waits out its grace.
   */
  settle: (refs: string[]) => Promise<void>
  /** The browser findings held for each of `refs`. */
  rendered: (refs: string[]) => Record<string, Finding[]>
  /** The findings each of `refs` holds from its last agent write, which need no browser. */
  changed: (refs: string[]) => Record<string, Finding[]>
  /** `browser-not-found` while the checker could not launch a browser. */
  unavailable: () => 'browser-not-found' | null
}

const bodySchema = z.object({
  refs: z.array(z.string().min(1).max(1024)).max(100_000),
})

/**
 * `POST /api/checks` with `{ refs }`, behind `requireWriter`, which `check`
 * calls for the browser findings a static run cannot reach. It rescans the
 * board, waits until no recheck of those frames is pending, then answers the
 * change and browser findings the server holds for them. A warm browser that
 * does not launch answers `browser.ran: false` with `browser-not-found` and
 * the change findings alone.
 */
export function checkRoutes(access: Access, checks: BrowserChecks): Hono {
  const app = new Hono()
  app.use('/api/checks', requireWriter(access))

  app.post('/api/checks', async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'usage',
            message: 'Send { "refs": [<frame-ref>, ...] }.',
          },
        },
        400,
      )
    }
    const { refs } = body.data
    await checks.refresh(refs)
    await checks.settle(refs)
    const reason = checks.unavailable()
    const browser: BrowserRun =
      reason === null ? { ran: true } : { ran: false, reason }
    const findings = [
      ...Object.values(checks.changed(refs)).flat(),
      ...(reason === null ? Object.values(checks.rendered(refs)).flat() : []),
    ]
    return c.json({ ok: true, data: { findings, browser } })
  })

  return app
}
