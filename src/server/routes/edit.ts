import { Hono } from 'hono'
import { z } from 'zod'

import { resolveFrameRef } from '@/server/board/refs'
import { refuseClaimed } from '@/server/claims/gate'
import { editFrameFile } from '@/server/edit/frame-file'
import type { History } from '@/server/history/stack'
import type { EditResult } from '@/shared/records/edit'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'

// Bounds the body alone. The writer refuses a value past its own limit as `invalid-edit`.
const value = z.string().max(10_000)
const name = z.string().min(1).max(256)

const editSchema = z.object({
  ref: z.string().min(1).max(1024),
  index: z.int().min(0),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('style'), property: name, value }),
    z.object({ kind: z.literal('attribute'), name, value }),
    z.object({ kind: z.literal('text'), value }),
  ]),
})

/** The source a frame held under a hash an agent's write replaced, or null when none is kept. */
export type SettledVersion = (
  ref: string,
  hash: string,
) => Promise<string | null>

/**
 * A hand edit of one element, behind `requireWriter`, its body mirroring
 * `edit`'s flags with the hash required, since the board always holds the
 * one it rendered. It writes through `editFrameFile`, which finds the element
 * again in a frame an agent wrote since from the source `version` kept, and
 * records the edited element's span as one step. It answers the `edit`
 * record with the index written and the hash written over. Each refusal the
 * writer returns answers 409 with its code, `stale-address` among them.
 */
export function editRoutes(
  root: string,
  access: Access,
  history: History,
  version?: SettledVersion,
): Hono {
  const app = new Hono()

  app.post('/api/frames/edit', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, editSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const was = (await version?.(ref, body.hash)) ?? null
    const result = editFrameFile(
      frame.path,
      { index: body.index, hash: body.hash },
      body.change,
      (hash) => (hash === body.hash ? was : null),
    )
    if (!result.ok) {
      return c.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: result.detail,
            details: { ref, index: body.index },
          },
        },
        409,
      )
    }
    // An edit that leaves the bytes as they were records nothing to undo.
    if (result.span.before !== result.span.after) {
      const journal = history.journal()
      journal.element(frame.path, ref, result.span)
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [ref],
      })
    }
    const data: EditResult = {
      ref,
      index: result.index,
      hash: result.hash,
      from: result.from,
    }
    return c.json({ ok: true, data })
  })

  app.onError(answerRefusal)

  return app
}
