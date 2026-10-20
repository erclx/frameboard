import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { readAuthor } from '@/server/author'
import { setBoxes } from '@/server/board/frames'
import { resolvePageRef } from '@/server/board/refs'
import { scanBoard } from '@/server/board/scan'
import { refuseClaimed } from '@/server/claims/gate'
import type { History } from '@/server/history/stack'
import { readTokenTable } from '@/server/look/token-table'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import { isValidName } from '@/shared/names'

import { type Access, requireWriter } from '../access/guard'
import type { FrameLook } from './frames'

/** What the write routes do, handed in by the server that owns the tabs and the socket. */
export interface BoardActions {
  /** Who may call the write routes. */
  access: Access
  /** Opens a browser tab when no writing board tab is connected, resolving whether it did. */
  open: () => Promise<boolean>
  /** Tells every board tab to show a frame, returning how many were told. */
  show: (ref: string) => number
}

const showBodySchema = z.object({ ref: z.string().min(1).max(1024) })

/** More frames than any page holds, so a body cannot grow without bound. */
const MAX_BOXES = 1000

const boxSchema = z.object({
  x: z.int(),
  y: z.int(),
  width: z.int().min(1),
  height: z.int().min(1),
})

const boxesSchema = z
  .record(z.string().min(1).max(256), boxSchema)
  .refine((boxes) => Object.keys(boxes).length <= MAX_BOXES)

const boxesBodySchema = z.object({
  page: z.string().min(1).max(1024),
  boxes: boxesSchema,
  expected: boxesSchema,
})

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'invalid-name': 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'stale-layout': 409,
  'frame-claimed': 409,
  'frame-locked': 423,
  'layout-invalid': 422,
  'lock-timeout': 503,
}

/**
 * The board's JSON API, each route answering in the CLI's `{ ok, data }`
 * envelope. The write routes need a writer, being the address file's token or
 * the cookie of a tab `serve` opened, so a page on another origin cannot call them.
 */
export function apiRoutes(
  root: string,
  actions: BoardActions,
  look: FrameLook,
  history?: History,
): Hono {
  const app = new Hono()
  const authorized = requireWriter(actions.access)

  app.get('/api/board', async (c) =>
    c.json({ ok: true, data: await scanBoard(root) }),
  )

  app.get('/api/projects/:project/tokens', (c) => {
    const project = c.req.param('project')
    if (!isValidName(project) || !existsSync(join(root, project))) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'project-not-found',
            message: `No project named ${project} in this board.`,
          },
        },
        404,
      )
    }
    return c.json({
      ok: true,
      data: readTokenTable(root, look.sheets(project)),
    })
  })

  app.get('/api/author', async (c) =>
    c.json({ ok: true, data: { name: await readAuthor(root) } }),
  )

  app.post('/api/open', authorized, async (c) =>
    c.json({ ok: true, data: { opened: await actions.open() } }),
  )

  app.post('/api/show', authorized, async (c) => {
    const body = showBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json(
        {
          ok: false,
          error: { code: 'usage', message: 'Send { "ref": "<frame ref>" }.' },
        },
        400,
      )
    }
    const tabs = actions.show(body.data.ref)
    return c.json({ ok: true, data: { ref: body.data.ref, tabs } })
  })

  app.post('/api/frames/boxes', authorized, async (c) => {
    const body = boxesBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'usage',
            message:
              'Send { "page": "<page ref>", "boxes": { <frame>: box }, "expected": { <frame>: box } }.',
          },
        },
        400,
      )
    }
    const { page, boxes, expected } = body.data
    try {
      const target = await resolvePageRef(root, page, { cwd: root })
      await refuseClaimed(
        root,
        Object.keys(boxes).map(
          (name) => `${target.project}/${target.name}/${name}`,
        ),
        new Date(),
      )
      const journal = history?.journal()
      const frames = await setBoxes(root, page, boxes, expected, {
        cwd: root,
        journal,
      })
      if (history && journal) {
        history.record({
          id: journal.id,
          changes: journal.changes,
          page: null,
          frames: frames.map((frame) => frame.ref),
        })
      }
      return c.json({ ok: true, data: { frames } })
    } catch (error) {
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
    }
  })

  return app
}
