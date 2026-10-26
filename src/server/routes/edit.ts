import { readFile } from 'node:fs/promises'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveFrameRef } from '@/server/board/refs'
import { refuseClaimed } from '@/server/claims/gate'
import { contentHash } from '@/server/edit/address'
import {
  editFrameFile,
  insertFrameFile,
  removeFrameFile,
} from '@/server/edit/frame-file'
import { elementMarkup, shapePaint, textFont } from '@/server/edit/insert'
import type { History } from '@/server/history/stack'
import { readTokenTable } from '@/server/look/token-table'
import type {
  EditResult,
  InsertResult,
  RemoveResult,
} from '@/shared/records/edit'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import type { FrameLook } from './frames'

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

const insertSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  parent: z.int().min(0),
  before: z.int().min(0).nullable(),
  element: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }),
    z.object({ kind: z.literal('rectangle') }),
    z.object({ kind: z.literal('ellipse') }),
    z.object({ kind: z.literal('divider'), vertical: z.boolean() }),
  ]),
})

const removeSchema = z.object({
  ref: z.string().min(1).max(1024),
  index: z.int().min(0),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
})

/** The source a frame held under a hash an agent's write replaced, or null when none is kept. */
export type SettledVersion = (
  ref: string,
  hash: string,
) => Promise<string | null>

/**
 * A hand edit of one element, a placed element, and a deleted one, each behind
 * `requireWriter` and refused on a frame another session holds.
 *
 * The edit's body mirrors
 * `edit`'s flags with the hash required, since the board always holds the
 * one it rendered. It writes through `editFrameFile`, which finds the element
 * again in a frame an agent wrote since from the source `version` kept, and
 * records the edited element's span as one step. It answers the `edit`
 * record with the index written and the hash written over. Each refusal the
 * writer returns answers 409 with its code, `stale-address` among them.
 *
 * The insert takes an element kind, never markup, and writes that kind's one
 * tag into the gap `parent` and `before` name, painted from the project's
 * tokens through `sheets`, and records it as one step. It answers the frame,
 * the new element's index, and the hash written. A hash the file no longer
 * has answers 409 `stale-address` with nothing written, since the gap's
 * indices name nothing past an agent's write, and a retried insert lands once.
 *
 * The remove takes out the element at `index`, with what it holds, from the
 * bytes `hash` names, and records it as one step whose undo puts it back
 * under its parent. It answers the frame and the hash written, and refuses a
 * moved file as `stale-address` the way the insert does.
 */
export function editRoutes(
  root: string,
  access: Access,
  history: History,
  version?: SettledVersion,
  sheets?: FrameLook['sheets'],
): Hono {
  const app = new Hono()

  app.post('/api/frames/edit', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, editSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    // The lookup waits on the scan turn, so an edit on the file's own hash skips it.
    const moved = contentHash(await readFile(frame.path)) !== body.hash
    const was = moved ? ((await version?.(ref, body.hash)) ?? null) : null
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
            details: {
              ref,
              index: body.index,
              ...('moved' in result ? { moved: result.moved } : {}),
            },
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

  app.post('/api/frames/insert', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, insertSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const tokens = sheets
      ? readTokenTable(root, sheets(frame.project)).tokens
      : []
    const result = insertFrameFile(
      frame.path,
      body.hash,
      { parent: body.parent, before: body.before },
      elementMarkup(body.element, shapePaint(tokens), textFont(tokens)),
    )
    if (!result.ok) {
      return c.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: result.detail,
            details: { ref, parent: body.parent },
          },
        },
        409,
      )
    }
    const journal = history.journal()
    journal.inserted(frame.path, ref, result.span)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref],
    })
    const data: InsertResult = { ref, index: result.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/remove', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, removeSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const result = removeFrameFile(frame.path, body.hash, body.index)
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
    const journal = history.journal()
    journal.deletedElement(frame.path, ref, result.span)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref],
    })
    const data: RemoveResult = { ref, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.onError(answerRefusal)

  return app
}
