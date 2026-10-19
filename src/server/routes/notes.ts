import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { readAuthor } from '@/server/author'
import { resolveFrameRef } from '@/server/board/refs'
import { anchorFor } from '@/server/notes/anchor'
import type { Delivery } from '@/server/notes/delivery'
import {
  addReply,
  addRoot,
  findNote,
  newNoteId,
  notesPath,
  setState,
  updateNotes,
} from '@/server/notes/store'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { Note, NotesFile } from '@/shared/records/notes'

import { type Access, requireWriter } from '../access/guard'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'note-not-found': 404,
  'stale-address': 409,
  'notes-invalid': 422,
  'lock-timeout': 503,
}

// Bounds what one write stores. The line a follower prints cuts it far
// shorter, and `notes` reads it whole.
const TEXT_MAX = 100_000

const text = z.string().trim().min(1).max(TEXT_MAX)
const session = z.string().min(1).max(256)

const pinSchema = z.object({
  /** The frame ref, `<project>/<page>/<frame>`. */
  frame: z.string().min(1).max(1024),
  text,
  /** The element's index, given with the `modifiedAt` the board rendered it at. */
  element: z.int().min(0).optional(),
  renderedAt: z.string().optional(),
  to: session.optional(),
})

const replySchema = z.object({ text, to: session.optional() })
const sendSchema = z.object({ to: session })

/**
 * The board's note writes, each behind `requireWriter`: pin a note, reply in
 * its thread, send it to a listening session, and mark it done. Each answers
 * the CLI's `{ ok, data }` envelope with the note it wrote, and a refusal its
 * `{ ok, error }`. A write offers the queue to delivery at once rather than
 * waiting on the watcher.
 */
export function notesRoutes(
  root: string,
  access: Access,
  delivery?: Delivery,
): Hono {
  const app = new Hono()
  app.use('/api/notes', requireWriter(access))
  app.use('/api/notes/*', requireWriter(access))

  const write = async (
    path: string,
    change: (file: NotesFile) => NotesFile,
    id: string,
  ): Promise<Note | undefined> => {
    const file = await updateNotes(path, change)
    void delivery?.offer().catch(() => {})
    return file.notes.find((note) => note.id === id)
  }

  app.post('/api/notes', async (c) => {
    const body = await parseBody(c.req.raw, pinSchema)
    const frame = await resolveFrameRef(root, body.frame, { cwd: root })
    if (body.element !== undefined && body.renderedAt === undefined) {
      throw new FrameboardError(
        'usage',
        'An element note needs the renderedAt the board showed it at.',
      )
    }
    const anchor =
      body.element === undefined
        ? null
        : await anchorFor(frame.path, body.element, body.renderedAt ?? '')
    const id = newNoteId()
    const author = await readAuthor(root)
    const note = await write(
      notesPath(root, frame.project, frame.page),
      (file) =>
        addRoot(
          file,
          {
            frame: frame.name,
            anchor,
            text: body.text,
            author,
            to: body.to ?? null,
          },
          { now: new Date(), id },
        ),
      id,
    )
    return c.json({ ok: true, data: { note } })
  })

  app.post('/api/notes/:id/replies', async (c) => {
    const body = await parseBody(c.req.raw, replySchema)
    const found = await findNote(root, c.req.param('id'))
    const id = newNoteId()
    const author = await readAuthor(root)
    const note = await write(
      found.path,
      (file) =>
        addReply(
          file,
          found.note.id,
          {
            text: body.text,
            from: 'developer',
            author,
            session: null,
            ...(body.to === undefined ? {} : { to: body.to }),
          },
          { now: new Date(), id },
        ),
      id,
    )
    return c.json({ ok: true, data: { note } })
  })

  app.post('/api/notes/:id/send', async (c) => {
    const body = await parseBody(c.req.raw, sendSchema)
    const found = await findNote(root, c.req.param('id'))
    const rootId = found.note.thread ?? found.note.id
    const note = await write(
      found.path,
      (file) => setState(file, rootId, 'queued', new Date(), body.to),
      rootId,
    )
    return c.json({ ok: true, data: { note } })
  })

  app.post('/api/notes/:id/done', async (c) => {
    const found = await findNote(root, c.req.param('id'))
    const rootId = found.note.thread ?? found.note.id
    const note = await write(
      found.path,
      (file) => setState(file, rootId, 'done', new Date()),
      rootId,
    )
    return c.json({ ok: true, data: { note } })
  })

  app.onError((error, c) => {
    if (!(error instanceof FrameboardError)) throw error
    return c.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      STATUS[error.code] ?? 500,
    )
  })

  return app
}

async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new FrameboardError('usage', `The note body ${parsed.error.message}`)
  }
  return parsed.data
}
