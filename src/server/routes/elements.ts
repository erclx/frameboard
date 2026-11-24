import { readFile } from 'node:fs/promises'

import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { resolveFrameRef } from '@/server/board/refs'
import { readFrame } from '@/server/checks/frame-source'
import { frameKit, tokenSheets } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import {
  elementLayouts,
  elementPlaceFacts,
  elementRounds,
  elementTree,
} from '@/server/edit/elements'
import { elementHidden } from '@/server/edit/hide'
import type { SelectionHolder } from '@/server/live/selection'
import { frameStyles } from '@/server/look/colors'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { ElementTree, FrameStyles } from '@/shared/records/elements'
import {
  type SelectedElement,
  type SelectionReport,
  selectionReportSchema,
  type SelectionResult,
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

/**
 * The element tree, read from the file so a culled frame lists the indices
 * `edit` addresses, the reported selection, and the static colors.
 */
export function elementsRoutes(
  root: string,
  access: Access,
  selection: SelectionHolder,
  tokens: string | null = null,
): Hono {
  const app = new Hono()
  app.post('/api/selection', requireWriter(access))

  const readTree = async (ref: string): Promise<ElementTree> => {
    const frame = await resolveFrameRef(root, ref, { cwd: root })
    const bytes = await readFile(frame.path)
    const source = readFrame(frame)
    const sheets = tokenSheets(root, frame.project, tokens, frameKit(frame))
    const elements = elementTree(
      bytes.toString('utf8'),
      elementLayouts(source, sheets),
      elementRounds(source, sheets),
      elementPlaceFacts(source, sheets),
      elementHidden(source, sheets),
    )
    if (!Array.isArray(elements)) {
      throw new FrameboardError(elements.reason, elements.detail, { ref })
    }
    const body = source.elements.findIndex(({ name }) => name === 'body')
    return {
      ref: `${frame.project}/${frame.page}/${frame.name}`,
      hash: contentHash(bytes),
      ...(body === -1 ? {} : { body }),
      elements,
    }
  }

  // Null once the file moved past the tab's hash, since the index may name another.
  const named = async (
    element: NonNullable<SelectionReport['element']>,
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

  app.get('/api/frames/styles', async (c) => {
    const ref = c.req.query('ref')
    if (!ref) {
      throw new FrameboardError('usage', 'Name the frame as ?ref=.')
    }
    const indexParam = c.req.query('index')
    const index = indexParam === undefined ? undefined : Number(indexParam)
    if (index !== undefined && !(Number.isInteger(index) && index >= 0)) {
      throw new FrameboardError('usage', 'Give ?index= as a whole number.')
    }
    const frame = await resolveFrameRef(root, ref, { cwd: root })
    const source = readFrame(frame)
    if (index !== undefined && !source.elements[index]) {
      throw new FrameboardError('usage', `The frame holds no element ${index}.`)
    }
    const data: FrameStyles = {
      ref: source.ref,
      hash: contentHash(source.html),
      ...frameStyles(
        source,
        tokenSheets(root, frame.project, tokens, frameKit(frame)),
        index,
      ),
    }
    return c.json({ ok: true, data })
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
    const parsed = selectionReportSchema.safeParse(
      await c.req.json().catch(() => null),
    )
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
