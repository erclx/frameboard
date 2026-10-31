import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveAsset } from '@/server/board/assets'
import { resolveFrameRef } from '@/server/board/refs'
import { readFrame, type Sheet } from '@/server/checks/frame-source'
import { refuseClaimed } from '@/server/claims/gate'
import { contentHash } from '@/server/edit/address'
import { elementPlaceFacts } from '@/server/edit/elements'
import {
  editFrameFile,
  insertFrameFile,
  moveFrameFile,
  placeFrameFile,
  removeFrameFile,
} from '@/server/edit/frame-file'
import {
  elementMarkup,
  type InsertKind,
  shapePaint,
  textFont,
} from '@/server/edit/insert'
import type { History } from '@/server/history/stack'
import { readTokenTable } from '@/server/look/token-table'
import type {
  EditResult,
  InsertResult,
  MoveResult,
  PlaceResult,
  RemoveResult,
} from '@/shared/records/edit'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import type { FrameLook } from './frames'

// Bounds the body alone. The writer refuses a value past its own limit as `invalid-edit`.
const value = z.string().max(10_000)
const name = z.string().min(1).max(256)
/** A dragged shape's side in CSS pixels. */
const side = z.int().min(1).max(10_000)

const editSchema = z.object({
  ref: z.string().min(1).max(1024),
  index: z.int().min(0),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('style'), property: name, value }),
    z.object({ kind: z.literal('attribute'), name, value }),
    z.object({ kind: z.literal('text'), value }),
    z.object({
      kind: z.literal('styles'),
      declarations: z.array(z.object({ property: name, value })).max(16),
    }),
  ]),
})

const insertSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  parent: z.int().min(0),
  before: z.int().min(0).nullable(),
  element: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }),
    z.object({
      kind: z.literal('rectangle'),
      width: side.optional(),
      height: side.optional(),
    }),
    z.object({
      kind: z.literal('ellipse'),
      width: side.optional(),
      height: side.optional(),
    }),
    z.object({ kind: z.literal('divider'), vertical: z.boolean() }),
    z.object({
      kind: z.literal('asset'),
      path: z.string().min(1).max(1024),
      width: side,
      height: side,
    }),
  ]),
})

const removeSchema = z.object({
  ref: z.string().min(1).max(1024),
  index: z.int().min(0),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
})

const moveSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  index: z.int().min(0),
  parent: z.int().min(0),
  before: z.int().min(0).nullable(),
})

/** A spot in CSS pixels, bounded well past any frame. */
const offset = z.number().min(-100_000).max(100_000)

const placeSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  index: z.int().min(0),
  spot: z
    .object({
      left: offset,
      top: offset,
      width: side.optional(),
      height: side.optional(),
    })
    .nullable(),
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
 * one it rendered, plus a `styles` change the CLI never sends, which writes
 * several declarations as one step. It writes through `editFrameFile`, which finds the element
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
 * A rectangle or an ellipse takes an optional width and height a drag drew.
 * An asset names a file under the project's `assets/` and the size it
 * shows at, and the server picks its tag from the file's kind. A file
 * outside that folder or not there answers 409 `asset-missing`, and one that
 * is no image, GIF, SVG, or video `asset-not-placeable`, each writing nothing.
 *
 * The remove takes out the element at `index`, with what it holds, from the
 * bytes `hash` names, and records it as one step whose undo puts it back
 * under its parent. It answers the frame and the hash written, and refuses a
 * moved file as `stale-address` the way the insert does.
 *
 * The move takes one element by index and the gap it goes into, both read
 * in the frame as the hash names it, and records it as one step an undo
 * puts back byte for byte. It answers the element's new index and the hash
 * written, and refuses as the insert does, with `invalid-container` for a
 * gap inside the element itself.
 *
 * The place takes one element by index and a spot in CSS pixels against its
 * containing block, or null to put it back in the flow, read in the frame as
 * the hash names it. It writes the element's start tag, and its static
 * parent's first, and records both as one step, so one undo restores both.
 * It answers the element's index and the hash written, refuses as the move
 * does, and refuses `reanchors-descendant` where a positioned parent would
 * move another element anchored above it.
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
    let element: InsertKind
    if (body.element.kind !== 'asset') {
      element = body.element
    } else {
      const asset = await resolveAsset(
        join(root, frame.project),
        body.element.path,
      )
      if (!asset.ok) {
        return c.json(
          {
            ok: false,
            error: {
              code: asset.code,
              message: asset.message,
              details: { ref, path: body.element.path },
            },
          },
          409,
        )
      }
      element = { ...body.element, video: asset.kind === 'video' }
    }
    const result = insertFrameFile(
      frame.path,
      body.hash,
      { parent: body.parent, before: body.before },
      elementMarkup(element, shapePaint(tokens), textFont(tokens)),
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

  app.post('/api/frames/move', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, moveSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const result = moveFrameFile(frame.path, body.hash, body.index, {
      parent: body.parent,
      before: body.before,
    })
    if (!result.ok) {
      return c.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: result.detail,
            details: { ref, index: body.index, parent: body.parent },
          },
        },
        409,
      )
    }
    const journal = history.journal()
    journal.relocated(frame.path, ref, result.span)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref],
    })
    const data: MoveResult = { ref, index: result.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/place', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, placeSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const source = readFrame(frame)
    // Facts read from other bytes than the hash names would pick the wrong tags.
    const facts =
      contentHash(source.html) === body.hash
        ? elementPlaceFacts(source, tokenSheets(frame.project))
        : []
    const result = placeFrameFile(
      frame.path,
      body.hash,
      body.index,
      body.spot,
      facts,
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
    const written = result.spans.filter((span) => span.before !== span.after)
    if (written.length > 0) {
      const journal = history.journal()
      for (const span of written) journal.element(frame.path, ref, span)
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [ref],
      })
    }
    const data: PlaceResult = { ref, index: body.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  /** The project's token sheets as the cascade reads them, board-wide first. */
  const tokenSheets = (project: string): Sheet[] => {
    const paths = sheets?.(project)
    return [paths?.board ?? null, paths?.project ?? null]
      .filter((path) => path !== null)
      .map((path) => ({
        css: readFileSync(path, 'utf8'),
        origin: 'token',
        path,
        offset: 0,
      }))
  }

  app.onError(answerRefusal)

  return app
}
