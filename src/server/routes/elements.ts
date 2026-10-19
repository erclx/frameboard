import { readFile } from 'node:fs/promises'

import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { resolveFrameRef } from '@/server/board/refs'
import { contentHash } from '@/server/edit/address'
import { elementTree } from '@/server/edit/elements'
import type { SelectionHolder } from '@/server/live/selection'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { ElementTree } from '@/shared/records/elements'
import type {
  SelectedElement,
  SelectionResult,
} from '@/shared/records/selection'

import { type Access, requireWriter } from '../access/guard'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'address-mismatch': 422,
}

/** More frames than any page holds, so a report cannot grow without bound. */
const MAX_FRAMES = 1000

const refSchema = z.string().min(1).max(1024)

const reportSchema = z.object({
  /** The id the tab said hello with, so its socket closing forgets the report. */
  tab: z.string().min(1).max(128),
  page: refSchema.nullable(),
  frames: z.array(refSchema).max(MAX_FRAMES),
  element: z
    .object({
      ref: refSchema,
      index: z.int().min(0),
      hash: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .nullable(),
})

/**
 * A frame's element tree, read from the file rather than a live iframe so a
 * culled frame lists the indices `edit` addresses, and the selection the
 * writing tab last reported, which `POST /api/selection` takes behind
 * `requireWriter` and `GET /api/selection` answers as the `selection` record.
 */
export function elementsRoutes(
  root: string,
  access: Access,
  selection: SelectionHolder,
): Hono {
  const app = new Hono()
  app.post('/api/selection', requireWriter(access))

  const readTree = async (ref: string): Promise<ElementTree> => {
    const frame = await resolveFrameRef(root, ref, { cwd: root })
    const bytes = await readFile(frame.path)
    const elements = elementTree(bytes.toString('utf8'))
    if (!Array.isArray(elements)) {
      throw new FrameboardError(elements.reason, elements.detail, { ref })
    }
    return {
      ref: `${frame.project}/${frame.page}/${frame.name}`,
      hash: contentHash(bytes),
      elements,
    }
  }

  /**
   * The reported element with its tag and name, or null once the file has
   * changed past the hash the tab read, since the index may now name another.
   */
  const named = async (
    element: NonNullable<z.infer<typeof reportSchema>['element']>,
  ): Promise<SelectedElement | null> => {
    const tree = await readTree(element.ref)
    const row = tree.elements.find(({ index }) => index === element.index)
    if (tree.hash !== element.hash || !row) return null
    return { ...element, ref: tree.ref, tag: row.tag, name: row.name }
  }

  app.get('/api/frames/elements', async (c) => {
    const ref = c.req.query('ref')
    if (!ref) {
      throw new FrameboardError('usage', 'Name the frame as ?ref=.')
    }
    return c.json({ ok: true, data: await readTree(ref) })
  })

  app.get('/api/selection', async (c) => {
    const held = selection.current()
    const [project = null, page = null] = held?.page?.split('/') ?? []
    const element = held?.element
      ? await named(held.element).catch(() => null)
      : null
    const data: SelectionResult = {
      project,
      page,
      frames: [...(held?.frames ?? [])],
      element,
      tabs: selection.tabs(),
    }
    return c.json({ ok: true, data })
  })

  app.post('/api/selection', async (c) => {
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw new FrameboardError(
        'usage',
        `The selection body ${parsed.error.message}`,
      )
    }
    const { tab, ...reported } = parsed.data
    selection.report(tab, reported)
    return c.json({ ok: true, data: {} })
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
