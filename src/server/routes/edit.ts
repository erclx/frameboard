import { readFileSync } from 'node:fs'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveFrameRef } from '@/server/board/refs'
import { refuseClaimed } from '@/server/claims/gate'
import { contentHash } from '@/server/edit/address'
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

/**
 * A hand edit of one element, behind `requireWriter`, its body mirroring
 * `edit`'s flags with the hash required, since the board always holds the
 * one it rendered. It writes through `editFrameFile`, records the frame's two
 * states as one step, and answers the `edit` record. Each refusal the writer
 * returns answers 409 with its code, `stale-address` among them.
 */
export function editRoutes(
  root: string,
  access: Access,
  history: History,
): Hono {
  const app = new Hono()

  app.post('/api/frames/edit', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, editSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const before = readFileSync(frame.path)
    const result = editFrameFile(
      frame.path,
      { index: body.index, hash: body.hash },
      body.change,
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
    const after = readFileSync(frame.path)
    // A write landing between the rename and this read would make the after
    // side another session's bytes, which an undo must never write back.
    // An edit that leaves the bytes as they were records nothing to undo.
    if (contentHash(after) === result.hash && !after.equals(before)) {
      const journal = history.journal()
      journal.content(frame.path, ref, before, after)
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [ref],
      })
    }
    const data: EditResult = { ref, index: body.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.onError(answerRefusal)

  return app
}
