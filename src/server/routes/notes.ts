import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { readAuthor } from '@/server/author'
import { resolveFrameRef, resolvePageRef } from '@/server/board/refs'
import { anchorFor } from '@/server/notes/anchor'
import type { Delivery } from '@/server/notes/delivery'
import { type Dispatch, DISPATCH_ENV } from '@/server/notes/dispatch'
import {
  assertStored,
  IMAGE_CONTENT_TYPES,
  NOTES_FOLDER,
  saveImages,
  storedImage,
} from '@/server/notes/images'
import {
  addReply,
  addRoot,
  deliveryOf,
  findNote,
  newNoteId,
  notesPath,
  type PageNotes,
  removeNote,
  setState,
  updateNotes,
} from '@/server/notes/store'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { Note, NotesFile } from '@/shared/records/notes'

import { type Access, requireWriter } from '../access/guard'
import { ASSET_BODY_LIMIT } from './assets'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'note-not-found': 404,
  'stale-address': 409,
  'dispatch-unavailable': 409,
  'notes-invalid': 422,
  'image-type-refused': 415,
  'dispatch-failed': 502,
  'lock-timeout': 503,
}

// Bounds what one write stores. The line a follower prints cuts it far
// shorter, and `notes` reads it whole.
const TEXT_MAX = 100_000

const text = z.string().trim().min(1).max(TEXT_MAX)
const session = z.string().min(1).max(256)
/** Page-relative paths an upload answered, each checked against the page on write. */
const images = z.array(z.string().max(256)).max(32).optional()
/** Asks for a new session in place of `to`. */
const dispatch = z.literal(true).optional()

const oneAddressee = {
  check: (body: { to?: string; dispatch?: true }) =>
    body.to === undefined || body.dispatch === undefined,
  message: { message: 'names a session or asks to start one, never both' },
}

const pinSchema = z
  .object({
    /** The frame ref, `<project>/<page>/<frame>`. */
    frame: z.string().min(1).max(1024),
    text,
    images,
    /** The element's index, given with the `modifiedAt` the board rendered it at. */
    element: z.int().min(0).optional(),
    renderedAt: z.string().optional(),
    to: session.optional(),
    dispatch,
  })
  .refine(oneAddressee.check, oneAddressee.message)

const replySchema = z
  .object({ text, images, to: session.optional(), dispatch })
  .refine(oneAddressee.check, oneAddressee.message)

const sendSchema = z
  .object({ to: session.optional(), dispatch })
  .refine((body) => (body.to === undefined) !== (body.dispatch === undefined), {
    message: 'names a session to send to or asks to start one',
  })

/**
 * The board's note writes, each behind `requireWriter`: pin a note, reply in
 * its thread, send it to a listening session, and mark it done. Each answers
 * the CLI's `{ ok, data }` envelope with the note it wrote, and a refusal its
 * `{ ok, error }`. A write offers the queue to delivery at once rather than
 * waiting on the watcher.
 *
 * Pin, reply, and send take `dispatch: true` in place of `to`, which starts a
 * session through `dispatch` under an id minted here and marks the thread's
 * root delivered to it, so the started session's inbox never prints it a
 * second time. A failed start takes back the message the request added, and
 * no `dispatch` refuses before anything is written.
 *
 * A note's images go up first, as multipart `files` with the `page` ref, to
 * `/api/notes/images`, which saves them to the page's `.notes/` and answers
 * their page-relative paths for pin and reply to carry. A write naming an
 * image its page does not hold is refused. `/api/note-images/...` reads one
 * back with no writer check, as the frames route reads a page's files, since
 * an `<img>` sends no `Origin`.
 */
export function notesRoutes(
  root: string,
  access: Access,
  delivery?: Delivery,
  dispatch?: Dispatch,
  imageLimit = ASSET_BODY_LIMIT,
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

  const dispatcher = (asked: true | undefined): Dispatch | undefined => {
    if (asked === undefined) return undefined
    if (!dispatch) {
      throw new FrameboardError(
        'dispatch-unavailable',
        `No session can be started, since serve was started without ${DISPATCH_ENV}.`,
      )
    }
    return dispatch
  }

  /**
   * Starts a session on a thread already on disk, then hands the root to it
   * as delivered, answering the note `answer` names.
   */
  const startSession = async (
    run: Dispatch,
    place: PageNotes,
    rootId: string,
    added: string | null,
    answer: string,
  ): Promise<Note | undefined> => {
    const minted = randomUUID()
    try {
      const { line } = await deliveryOf(root, place, rootId)
      await run({ session: minted, id: rootId, line })
    } catch (error) {
      if (added !== null) {
        await updateNotes(place.path, (file) => removeNote(file, added))
      }
      throw error
    }
    return write(
      place.path,
      (file) => setState(file, rootId, 'delivered', new Date(), minted),
      answer,
    )
  }

  app.post(
    '/api/notes/images',
    bodyLimit({
      maxSize: imageLimit,
      onError: (c) =>
        c.json(
          {
            ok: false,
            error: {
              code: 'asset-too-large',
              message: `A note's images may carry ${imageLimit / 1024 / 1024} MiB at most. Nothing was saved.`,
            },
          },
          413,
        ),
    }),
    async (c) => {
      const form = await c.req
        .parseBody({ all: true })
        .catch(() => ({}) as Record<string, unknown>)
      const sent = [form.files].flat().filter((v) => v instanceof File)
      if (typeof form.page !== 'string' || sent.length === 0) {
        throw new FrameboardError(
          'usage',
          'Send multipart/form-data with the page ref in "page" and images in "files".',
        )
      }
      const page = await resolvePageRef(root, form.page, { cwd: root })
      const bytes = await Promise.all(
        sent.map(async (file) => new Uint8Array(await file.arrayBuffer())),
      )
      return c.json({
        ok: true,
        data: { images: await saveImages(page.path, bytes) },
      })
    },
  )

  app.get('/api/note-images/:project/:page/:name', async (c) => {
    const { project, page, name } = c.req.param()
    const found = await resolvePageRef(root, `${project}/${page}`, {
      cwd: root,
    }).catch(() => null)
    const file =
      found && (await storedImage(found.path, `${NOTES_FOLDER}/${name}`))
    if (!file) return c.notFound()
    return c.body(new Uint8Array(await readFile(file)), 200, {
      'Content-Type':
        IMAGE_CONTENT_TYPES[extname(file).slice(1)] ??
        'application/octet-stream',
      'Cache-Control': 'no-store',
    })
  })

  app.post('/api/notes', async (c) => {
    const body = await parseBody(c.req.raw, pinSchema)
    const run = dispatcher(body.dispatch)
    const frame = await resolveFrameRef(root, body.frame, { cwd: root })
    await assertStored(dirname(frame.path), body.images ?? [])
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
    const place = {
      project: frame.project,
      page: frame.page,
      path: notesPath(root, frame.project, frame.page),
    }
    const note = await write(
      place.path,
      (file) =>
        addRoot(
          file,
          {
            frame: frame.name,
            anchor,
            text: body.text,
            images: body.images,
            author,
            to: body.to ?? null,
          },
          { now: new Date(), id },
        ),
      id,
    )
    if (!run) return c.json({ ok: true, data: { note } })
    const started = await startSession(run, place, id, id, id)
    return c.json({ ok: true, data: { note: started } })
  })

  app.post('/api/notes/:id/replies', async (c) => {
    const body = await parseBody(c.req.raw, replySchema)
    const run = dispatcher(body.dispatch)
    const found = await findNote(root, c.req.param('id'))
    await assertStored(dirname(found.path), body.images ?? [])
    const rootId = found.note.thread ?? found.note.id
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
            images: body.images,
            from: 'developer',
            author,
            session: null,
            ...(body.to === undefined ? {} : { to: body.to }),
          },
          { now: new Date(), id },
        ),
      id,
    )
    if (!run) return c.json({ ok: true, data: { note } })
    const started = await startSession(run, found, rootId, id, id)
    return c.json({ ok: true, data: { note: started } })
  })

  app.post('/api/notes/:id/send', async (c) => {
    const body = await parseBody(c.req.raw, sendSchema)
    const run = dispatcher(body.dispatch)
    const found = await findNote(root, c.req.param('id'))
    const rootId = found.note.thread ?? found.note.id
    if (run) {
      const note = await startSession(run, found, rootId, null, rootId)
      return c.json({ ok: true, data: { note } })
    }
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
