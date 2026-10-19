import { join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
} from '@/server/board/pages'
import { resolvePageRef } from '@/server/board/refs'
import { readPageOrder } from '@/server/board/scan'
import type { History, Step } from '@/server/history/stack'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'

const ref = z.string().min(1).max(1024)
const name = z.string().min(1).max(256)
const index = z.int().min(0)

const addSchema = z.object({ ref, index: index.optional() })
const duplicateSchema = z.object({ ref, name: name.optional() })
const renameSchema = z.object({ ref, name })
const moveSchema = z.object({ ref, index })
const deleteSchema = z.object({ ref })

/**
 * The board's structure writes, each behind `requireWriter`, its body
 * mirroring the CLI verb's flags and its answer the record the CLI prints.
 * Each write reports into its own journal and records one step, so the
 * developer can undo it, and names the page the board shows on either side
 * of it, so an undo can follow a page it brings back or renames.
 */
export function structureRoutes(
  root: string,
  access: Access,
  history: History,
): Hono {
  const app = new Hono()
  app.use('/api/page/*', requireWriter(access))
  const cwd = root

  /** Runs one verb with a fresh journal and records what it reported. */
  const recorded = async <T>(
    write: (journal: ReturnType<History['journal']>) => Promise<T>,
    describe: (result: T) => Promise<Pick<Step, 'page' | 'frames'>>,
  ): Promise<T> => {
    const journal = history.journal()
    const result = await write(journal)
    history.record({
      id: journal.id,
      changes: journal.changes,
      ...(await describe(result)),
    })
    return result
  }

  const orderOf = async (project: string) =>
    (await readPageOrder(join(root, project))).pages

  app.post('/api/page/add', async (c) => {
    const body = await parseBody(c.req.raw, addSchema)
    const page = await recorded(
      (journal) => addPage(root, body.ref, { cwd, index: body.index, journal }),
      async (added) => {
        const [project] = added.ref.split('/')
        const order = await orderOf(project ?? '')
        const beside = order[added.index - 1] ?? order[added.index + 1]
        return {
          page: {
            before: beside === undefined ? null : `${project}/${beside}`,
            after: added.ref,
          },
          frames: [],
        }
      },
    )
    return c.json({ ok: true, data: page })
  })

  app.post('/api/page/duplicate', async (c) => {
    const body = await parseBody(c.req.raw, duplicateSchema)
    const source = await resolvePageRef(root, body.ref, { cwd })
    const page = await recorded(
      (journal) =>
        duplicatePage(root, body.ref, { cwd, name: body.name, journal }),
      async (copy) => ({
        page: { before: `${source.project}/${source.name}`, after: copy.ref },
        frames: [],
      }),
    )
    return c.json({ ok: true, data: page })
  })

  app.post('/api/page/rename', async (c) => {
    const body = await parseBody(c.req.raw, renameSchema)
    const source = await resolvePageRef(root, body.ref, { cwd })
    const page = await recorded(
      (journal) => renamePage(root, body.ref, body.name, { cwd, journal }),
      async (renamed) => ({
        page: {
          before: `${source.project}/${source.name}`,
          after: renamed.ref,
        },
        frames: [],
      }),
    )
    return c.json({ ok: true, data: page })
  })

  app.post('/api/page/move', async (c) => {
    const body = await parseBody(c.req.raw, moveSchema)
    const page = await recorded(
      (journal) =>
        movePage(root, body.ref, { cwd, index: body.index, journal }),
      async () => ({ page: null, frames: [] }),
    )
    return c.json({ ok: true, data: page })
  })

  app.post('/api/page/delete', async (c) => {
    const body = await parseBody(c.req.raw, deleteSchema)
    const source = await resolvePageRef(root, body.ref, { cwd })
    const order = await orderOf(source.project)
    const at = order.indexOf(source.name)
    const beside = order[at + 1] ?? order[at - 1]
    const result = await recorded(
      (journal) => deletePage(root, body.ref, { cwd, journal }),
      async () => ({
        page: {
          before: `${source.project}/${source.name}`,
          after: beside === undefined ? null : `${source.project}/${beside}`,
        },
        frames: [],
      }),
    )
    return c.json({ ok: true, data: result })
  })

  app.onError(answerRefusal)

  return app
}
