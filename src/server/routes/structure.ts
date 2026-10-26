import { join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import {
  addFrame,
  deleteFrame,
  duplicateFrame,
  fitHeight,
  orderFrame,
  readFrame,
  renameFrame,
  setFrameFlag,
} from '@/server/board/frames'
import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
} from '@/server/board/pages'
import { type HeldFrame, holdFrames, pasteFrames } from '@/server/board/paste'
import {
  addProject,
  deleteProject,
  duplicateProject,
  renameProject,
} from '@/server/board/projects'
import { resolvePageRef, resolveProject } from '@/server/board/refs'
import { listProjects, readPageOrder } from '@/server/board/scan'
import { refuseClaimed } from '@/server/claims/gate'
import type { History, Step } from '@/server/history/stack'
import type { MeasureFrame } from '@/server/live/hug'
import { writeStarterSheet } from '@/server/look/starter'
import { START_PROJECT } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { FRAME_SIZES, type FrameSizePreset } from '@/shared/frame-sizes'
import { nextFreeName } from '@/shared/names'
import {
  DEFAULT_LOOK,
  STARTER_ACCENTS,
  STARTER_FONTS,
  type StarterAccent,
  type StarterFont,
} from '@/shared/starter-tokens'

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

/** More frames than any page holds, so a body cannot grow without bound. */
const refs = z.array(ref).min(1).max(1000)
const coordinate = z.int()
const frameAddSchema = z.object({
  ref,
  size: z.enum(Object.keys(FRAME_SIZES) as [FrameSizePreset]).optional(),
  width: z.int().min(1).optional(),
  height: z.int().min(1).optional(),
  x: coordinate.optional(),
  y: coordinate.optional(),
})
const framesSchema = z.object({ refs })
const frameDuplicateSchema = z.object({
  refs,
  offset: z.object({ x: coordinate, y: coordinate }).optional(),
})
const frameSchema = z.object({ ref })
const pasteSchema = z.object({
  ref,
  at: z.object({ x: coordinate, y: coordinate }).optional(),
})
const frameFlagSchema = z.object({
  refs,
  flag: z.enum(['hidden', 'locked']),
  on: z.boolean(),
})
const projectAddSchema = z.object({ name: name.optional() })
const projectSchema = z.object({ ref })
const projectTokensSchema = z.object({
  ref,
  accent: z
    .enum(Object.keys(STARTER_ACCENTS) as [StarterAccent])
    .default(DEFAULT_LOOK.accent),
  font: z
    .enum(Object.keys(STARTER_FONTS) as [StarterFont])
    .default(DEFAULT_LOOK.font),
})

/**
 * The board's structure writes, each behind `requireWriter`, its body
 * mirroring the CLI verb's flags and its answer the record the CLI prints.
 * Each write reports into its own journal and records one step, so the
 * developer can undo it, and names the page the board shows on either side
 * of it, so an undo can follow a page it brings back or renames.
 * `measure` reads a frame's content on the warm browser for a fit, which
 * refuses `browser-not-found` where none is given. `tokens` is the
 * `--tokens` sheet the server was given, which a starter sheet never goes under.
 */
export function structureRoutes(
  root: string,
  access: Access,
  history: History,
  measure?: MeasureFrame,
  tokens: string | null = null,
): Hono {
  const app = new Hono()
  app.use('/api/page/*', requireWriter(access))
  app.use('/api/frame/*', requireWriter(access))
  app.use('/api/clipboard/*', requireWriter(access))
  app.use('/api/project/*', requireWriter(access))
  const cwd = root

  /** Runs one verb with a fresh journal and records what it reported. */
  const recorded = async <T>(
    write: (journal: ReturnType<History['journal']>) => Promise<T>,
    describe: (result: T) => Promise<Pick<Step, 'page' | 'frames' | 'renamed'>>,
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

  /**
   * Refuses a write that would rename, move, or remove a frame another
   * session holds, before anything is written. Writes that leave every
   * existing frame file and box alone, being an add, a duplicate, a flag, a
   * copy, a paste, and a move of a page or frame in its order, go at once.
   */
  const refuseHeld = (refs: string[]) => refuseClaimed(root, refs, new Date())

  /** `refuseHeld` for frames as the body names them, read back to their canonical refs. */
  const refuseHeldFrames = async (frames: string[]) => {
    const records = await Promise.all(
      frames.map((frame) => readFrame(root, frame, { cwd })),
    )
    await refuseHeld(records.map((record) => record.ref))
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
    await refuseHeld([`${source.project}/${source.name}`])
    const page = await recorded(
      (journal) => renamePage(root, body.ref, body.name, { cwd, journal }),
      async (renamed) => ({
        page: {
          before: `${source.project}/${source.name}`,
          after: renamed.ref,
        },
        frames: [],
        renamed: {
          before: `${source.project}/${source.name}`,
          after: renamed.ref,
        },
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
    await refuseHeld([`${source.project}/${source.name}`])
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

  /** A frame write stays on its page, so the board follows no page across it. */
  const onFrames = async (frames: string[]) => ({ page: null, frames })

  /** Refuses the whole write when any frame is locked, before anything is written. */
  const refuseLocked = async (frames: string[]) => {
    const records = await Promise.all(
      frames.map((frame) => readFrame(root, frame, { cwd })),
    )
    const locked = records.find((record) => record.locked)
    if (locked) {
      throw new FrameboardError('frame-locked', `${locked.ref} is locked.`, {
        ref: locked.ref,
      })
    }
  }

  /** Runs `write` on each frame in turn, under one journal, so the set undoes as one step. */
  const eachFrame = <T>(
    frames: string[],
    write: (
      frame: string,
      journal: ReturnType<History['journal']>,
    ) => Promise<T>,
    touched: (results: T[]) => string[],
  ) =>
    recorded(
      async (journal) => {
        const results: T[] = []
        for (const frame of frames) results.push(await write(frame, journal))
        return results
      },
      (results) => onFrames(touched(results)),
    )

  app.post('/api/frame/add', async (c) => {
    const body = await parseBody(c.req.raw, frameAddSchema)
    const frame = await recorded(
      (journal) => addFrame(root, body.ref, { ...body, cwd, journal }),
      (added) => onFrames([added.ref]),
    )
    return c.json({ ok: true, data: frame })
  })

  app.post('/api/frame/duplicate', async (c) => {
    const body = await parseBody(c.req.raw, frameDuplicateSchema)
    const copies = await eachFrame(
      body.refs,
      (frame, journal) =>
        duplicateFrame(root, frame, { cwd, journal, offset: body.offset }),
      (records) => records.map((record) => record.ref),
    )
    return c.json({ ok: true, data: copies })
  })

  app.post('/api/frame/rename', async (c) => {
    const body = await parseBody(c.req.raw, renameSchema)
    await refuseHeldFrames([body.ref])
    const frame = await recorded(
      (journal) => renameFrame(root, body.ref, body.name, { cwd, journal }),
      (renamed) => onFrames([renamed.ref]),
    )
    return c.json({ ok: true, data: frame })
  })

  app.post('/api/frame/order', async (c) => {
    const body = await parseBody(c.req.raw, moveSchema)
    const frame = await recorded(
      (journal) =>
        orderFrame(root, body.ref, { cwd, index: body.index, journal }),
      (ordered) => onFrames([ordered.ref]),
    )
    return c.json({ ok: true, data: frame })
  })

  app.post('/api/frame/flag', async (c) => {
    const body = await parseBody(c.req.raw, frameFlagSchema)
    const frames = await eachFrame(
      body.refs,
      (frame, journal) =>
        setFrameFlag(root, frame, body.flag, { cwd, on: body.on, journal }),
      (records) => records.map((record) => record.ref),
    )
    return c.json({ ok: true, data: frames })
  })

  /**
   * Sets one frame's height to its content's own and turns its height
   * hugging on, as `frame fit` does, refusing a frame whose content sizes
   * itself off the viewport. The width is reported, never changed.
   */
  app.post('/api/frame/fit', async (c) => {
    const body = await parseBody(c.req.raw, frameSchema)
    await refuseLocked([body.ref])
    await refuseHeldFrames([body.ref])
    if (!measure) {
      throw new FrameboardError(
        'browser-not-found',
        "Fit height needs the board server's browser, and none runs here.",
      )
    }
    const frame = await readFrame(root, body.ref, { cwd })
    const measured = await measure(frame)
    const fit = await recorded(
      (journal) =>
        fitHeight(root, frame.ref, measured.height, { cwd, journal }),
      (record) => onFrames([record.ref]),
    )
    return c.json({
      ok: true,
      data: {
        frame: fit,
        contentHeight: measured.height,
        contentWidth: measured.contentWidth,
        tooWide: measured.contentWidth > fit.box.width,
      },
    })
  })

  app.post('/api/frame/delete', async (c) => {
    const body = await parseBody(c.req.raw, framesSchema)
    await refuseLocked(body.refs)
    await refuseHeldFrames(body.refs)
    const deleted = await eachFrame(
      body.refs,
      (frame, journal) => deleteFrame(root, frame, { cwd, journal }),
      (results) => results.map((result) => result.deleted),
    )
    return c.json({ ok: true, data: deleted })
  })

  /**
   * The frames the developer last copied or cut, held as bytes and boxes in
   * memory, so a paste never depends on the source surviving and a restart
   * empties it.
   */
  let clipboard: HeldFrame[] = []

  app.post('/api/clipboard/copy', async (c) => {
    const body = await parseBody(c.req.raw, framesSchema)
    clipboard = await holdFrames(root, body.refs, { cwd })
    return c.json({ ok: true, data: { held: clipboard.length } })
  })

  app.post('/api/clipboard/cut', async (c) => {
    const body = await parseBody(c.req.raw, framesSchema)
    await refuseLocked(body.refs)
    await refuseHeldFrames(body.refs)
    const held = await holdFrames(root, body.refs, { cwd })
    await eachFrame(
      body.refs,
      (frame, journal) => deleteFrame(root, frame, { cwd, journal }),
      (results) => results.map((result) => result.deleted),
    )
    clipboard = held
    return c.json({ ok: true, data: { held: clipboard.length } })
  })

  app.post('/api/clipboard/paste', async (c) => {
    const body = await parseBody(c.req.raw, pasteSchema)
    if (clipboard.length === 0) {
      throw new FrameboardError('usage', 'There is nothing to paste.')
    }
    const held = clipboard
    const frames = await recorded(
      (journal) =>
        pasteFrames(root, body.ref, held, { cwd, journal, at: body.at }),
      (pasted) => onFrames(pasted.map((frame) => frame.ref)),
    )
    return c.json({ ok: true, data: frames })
  })

  /** A project write leaves the board on home, so it follows no page or frame. */
  const onHome = async () => ({ page: null, frames: [] })

  app.post('/api/project/add', async (c) => {
    const body = await parseBody(c.req.raw, projectAddSchema)
    const projectName =
      body.name ?? nextFreeName(START_PROJECT, await listProjects(root))
    const project = await recorded(
      (journal) => addProject(root, projectName, new Date(), { journal }),
      onHome,
    )
    return c.json({ ok: true, data: project })
  })

  app.post('/api/project/rename', async (c) => {
    const body = await parseBody(c.req.raw, renameSchema)
    const source = await resolveProject(root, body.ref)
    await refuseHeld([source.name])
    const project = await recorded(
      (journal) => renameProject(root, body.ref, body.name, { journal }),
      async (renamed) => ({
        ...(await onHome()),
        renamed: { before: source.name, after: renamed.name },
      }),
    )
    return c.json({ ok: true, data: project })
  })

  app.post('/api/project/duplicate', async (c) => {
    const body = await parseBody(c.req.raw, projectSchema)
    const project = await recorded(
      (journal) => duplicateProject(root, body.ref, new Date(), { journal }),
      onHome,
    )
    return c.json({ ok: true, data: project })
  })

  /** Creates the project's `tokens.css` from a preset, refusing where any sheet already reaches it. */
  app.post('/api/project/tokens', async (c) => {
    const body = await parseBody(c.req.raw, projectTokensSchema)
    const sheet = await recorded(
      (journal) =>
        writeStarterSheet(
          root,
          body.ref,
          { accent: body.accent, font: body.font },
          { tokens, journal },
        ),
      onHome,
    )
    return c.json({ ok: true, data: sheet })
  })

  app.post('/api/project/delete', async (c) => {
    const body = await parseBody(c.req.raw, projectSchema)
    await refuseHeld([(await resolveProject(root, body.ref)).name])
    const result = await recorded(
      (journal) => deleteProject(root, body.ref, { journal }),
      onHome,
    )
    return c.json({ ok: true, data: result })
  })

  app.onError(answerRefusal)

  return app
}
