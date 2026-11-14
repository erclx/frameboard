import { join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveAsset } from '@/server/board/assets'
import {
  addFrame,
  deleteFrame,
  duplicateFrame,
  type HeightTarget,
  orderFrame,
  readFrame,
  renameFrame,
  setFrameDevice,
  setFrameFlag,
  setFrameTransition,
  setHeightModes,
  setLinkedWidths,
  type WidthsTarget,
} from '@/server/board/frames'
import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  setPageTransition,
} from '@/server/board/pages'
import { type HeldFrame, holdFrames, pasteFrames } from '@/server/board/paste'
import {
  addProject,
  deleteProject,
  duplicateProject,
  fileProjects,
  renameProject,
  setProjectRule,
} from '@/server/board/projects'
import {
  resolveFrameRef,
  resolvePageRef,
  resolveProject,
} from '@/server/board/refs'
import { listProjects, readPageOrder } from '@/server/board/scan'
import {
  addSection,
  deleteSection,
  renameSection,
} from '@/server/board/sections'
import { RULES } from '@/server/checks/run'
import { refuseClaimed } from '@/server/claims/gate'
import { elementMarkup } from '@/server/edit/insert'
import type { History, Step } from '@/server/history/stack'
import type { MeasureFrame } from '@/server/live/hug'
import { writeStarterSheet } from '@/server/look/starter'
import type { PlaceableKind } from '@/shared/asset-kinds'
import { START_PROJECT } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { DEVICES } from '@/shared/frame-device'
import { FRAME_SIZE_NAMES, referenceHeight } from '@/shared/frame-sizes'
import type { LinkedWidth } from '@/shared/frame-widths'
import { nextFreeName } from '@/shared/names'
import { DIRECTIONS, TRANSITION_MS } from '@/shared/present-transition'
import { shapePaint } from '@/shared/shape-paint'
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
  size: z.enum(FRAME_SIZE_NAMES).optional(),
  width: z.int().min(1).optional(),
  height: z.int().min(1).optional(),
  x: coordinate.optional(),
  y: coordinate.optional(),
  /** A file under the project's `assets/` the new frame holds, at the frame's size. */
  asset: z.string().min(1).max(1024).optional(),
})
const framesSchema = z.object({ refs })
const frameDuplicateSchema = z.object({
  refs,
  offset: z.object({ x: coordinate, y: coordinate }).optional(),
})
const frameHeightSchema = z.object({
  refs,
  mode: z.enum(['fixed', 'fit', 'scroll']),
  expected: z
    .record(
      ref,
      z.object({
        x: coordinate,
        y: coordinate,
        width: z.int().min(1),
        height: z.int().min(1),
      }),
    )
    .refine((boxes) => Object.keys(boxes).length <= 1000),
  heights: z
    .record(ref, z.int().min(1))
    .refine((heights) => Object.keys(heights).length <= 1000)
    .optional(),
})
const pasteSchema = z.object({
  ref,
  at: z.object({ x: coordinate, y: coordinate }).optional(),
})
const frameDeviceSchema = z.object({
  refs,
  device: z.enum(DEVICES).nullable(),
})
const linkedWidth = z.int().min(1)
/** More widths than any device list offers, so a body cannot grow without bound. */
const widthList = z.array(linkedWidth).max(64)
/**
 * The whole list of widths each frame also shows at, in draw order, an empty
 * list clearing it. `expected` holds each frame's list as the caller drew it,
 * keyed by the ref the body names.
 */
const frameWidthsSchema = z.object({
  refs,
  widths: widthList,
  expected: z
    .record(ref, widthList)
    .refine((lists) => Object.keys(lists).length <= 1000),
})
/** `name` is checked by the setters, which know the project's own transitions. */
const transition = z.object({
  name: z.string().min(1).max(64),
  direction: z.enum(DIRECTIONS).optional(),
  ms: z.int().min(TRANSITION_MS.min).max(TRANSITION_MS.max).optional(),
})
/** Null clears the page's transition, so its slides cut. */
const pageTransitionSchema = z.object({
  ref,
  transition: transition.nullable(),
})
/** Null clears each frame's override, so it takes its page's. */
const frameTransitionSchema = z.object({
  refs,
  transition: transition.nullable(),
})
const frameFlagSchema = z.object({
  refs,
  flag: z.enum(['hidden', 'locked']),
  on: z.boolean(),
})
const sectionBox = z.object({
  x: coordinate,
  y: coordinate,
  width: z.int().min(1),
  height: z.int().min(1),
})
const sectionAddSchema = z.object({
  page: ref,
  name: name.optional(),
  box: sectionBox,
})
const sectionRenameSchema = z.object({ page: ref, section: name, name })
const sectionSchema = z.object({ page: ref, section: name })
const projectAddSchema = z.object({ name: name.optional() })
const projectSchema = z.object({ ref })
/** More projects than any board holds, so a body cannot grow without bound. */
const projectRefs = z.array(ref).min(1).max(1000)
const projectGroupSchema = z.object({
  refs: projectRefs,
  group: name.nullable(),
})
const projectArchiveSchema = z.object({
  refs: projectRefs,
  archived: z.boolean(),
})
/**
 * A rule turned off is one a check declares. One turned on takes any id, so
 * one written by hand, or left by a rule since retired, can still come out.
 */
const projectRuleSchema = z.discriminatedUnion('off', [
  z.object({
    project: ref,
    rule: z.enum(RULES.map((rule) => rule.id) as [string, ...string[]]),
    off: z.literal(true),
  }),
  z.object({
    project: ref,
    rule: z.string().min(1).max(200),
    off: z.literal(false),
  }),
])
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
 * The bytes a new frame holds for the asset at `path`, as an insert writes
 * them, at the size the frame is added at. An audio takes the width alone, so
 * its frame hugs the player's height, and every other kind refuses `usage`
 * without both sides.
 */
function mediaMarkup(
  ref: string,
  path: string,
  kind: PlaceableKind,
  { width, height }: { width?: number; height?: number },
): string {
  const tag = kind === 'video' || kind === 'audio' ? kind : 'img'
  if (width === undefined || (tag !== 'audio' && height === undefined)) {
    throw new FrameboardError(
      'usage',
      `A frame added with an asset takes the media's width${tag === 'audio' ? '' : ' and height'}.`,
      { ref, path },
    )
  }
  // An asset's markup reads neither the paint nor the font.
  return elementMarkup(
    { kind: 'asset', path, tag, width, height: height ?? 0 },
    shapePaint([]),
    '',
  )
}

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
  app.use('/api/section/*', requireWriter(access))
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

  /** Sets or clears a page's slide transition as one step, leaving every frame file alone. */
  app.post('/api/page/transition', async (c) => {
    const body = await parseBody(c.req.raw, pageTransitionSchema)
    const page = await recorded(
      (journal) =>
        setPageTransition(root, body.ref, body.transition, { cwd, journal }),
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
    // A name an agent reserved is held, so its later file never overwrites this one.
    const target = await resolveFrameRef(root, body.ref, {
      cwd,
      allowMissing: true,
    })
    const targetRef = `${target.project}/${target.page}/${target.name}`
    await refuseHeld([targetRef])
    const { asset: path, ...placing } = body
    let media: string | undefined
    if (path !== undefined) {
      const asset = await resolveAsset(join(root, target.project), path)
      if (!asset.ok) {
        return c.json(
          {
            ok: false,
            error: {
              code: asset.code,
              message: asset.message,
              details: { ref: targetRef, path },
            },
          },
          409,
        )
      }
      media = mediaMarkup(targetRef, path, asset.kind, body)
    }
    const frame = await recorded(
      (journal) =>
        addFrame(root, body.ref, { ...placing, body: media, cwd, journal }),
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
    const source = await readFrame(root, body.ref, { cwd })
    await refuseHeld([
      source.ref,
      `${source.project}/${source.page}/${body.name}`,
    ])
    const frame = await recorded(
      (journal) => renameFrame(root, body.ref, body.name, { cwd, journal }),
      async (renamed) => ({
        ...(await onFrames([renamed.ref])),
        ...(renamed.ref === source.ref
          ? {}
          : { renamed: { before: source.ref, after: renamed.ref } }),
      }),
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

  /** Sets or clears the device drawn around each frame, in one step, leaving every frame file alone. */
  app.post('/api/frame/device', async (c) => {
    const body = await parseBody(c.req.raw, frameDeviceSchema)
    const frames = await eachFrame(
      body.refs,
      (frame, journal) =>
        setFrameDevice(root, frame, body.device, { cwd, journal }),
      (records) => records.map((record) => record.ref),
    )
    return c.json({ ok: true, data: frames })
  })

  /**
   * Sets the widths each frame also shows at, in one step, leaving every
   * frame file alone. A frame whose stored list differs from its `expected`
   * refuses `stale-layout` before any frame is written, so a hand write never
   * drops a width an agent added since the board drew it. The compare and
   * the write share one layout lock. A locked frame refuses the whole write.
   */
  app.post('/api/frame/widths', async (c) => {
    const body = await parseBody(c.req.raw, frameWidthsSchema)
    const targets: WidthsTarget[] = body.refs.map((ref) => {
      const expected = body.expected[ref]
      if (!expected) {
        throw new FrameboardError(
          'usage',
          `The body gives ${ref} no expected widths.`,
          { ref },
        )
      }
      return { ref, expected }
    })
    await refuseLocked(body.refs)
    const frames = await recorded(
      (journal) =>
        setLinkedWidths(root, targets, body.widths, { cwd, journal }),
      (records) => onFrames(records.map((record) => record.ref)),
    )
    return c.json({ ok: true, data: frames })
  })

  /** Sets or clears each frame's transition override, in one step, leaving every frame file alone. */
  app.post('/api/frame/transition', async (c) => {
    const body = await parseBody(c.req.raw, frameTransitionSchema)
    const frames = await eachFrame(
      body.refs,
      (frame, journal) =>
        setFrameTransition(root, frame, body.transition, { cwd, journal }),
      (records) => records.map((record) => record.ref),
    )
    return c.json({ ok: true, data: frames })
  })

  /**
   * Sets how each frame holds its height, `fixed`, `fit`, or `scroll`, in one
   * step. `expected` holds each frame's box as the caller saw it, keyed by the
   * ref the body names, and a frame changed since refuses `stale-layout`
   * before any frame is written. `heights` gives a `scroll` write the screen
   * height each named frame takes, and refuses `usage` with any other mode. A
   * locked or claimed frame refuses the whole
   * write, and `fit` measures each frame and its linked widths on the warm
   * browser first, refusing `browser-not-found` where none runs.
   */
  app.post('/api/frame/height', async (c) => {
    const body = await parseBody(c.req.raw, frameHeightSchema)
    if (body.heights && body.mode !== 'scroll') {
      throw new FrameboardError(
        'usage',
        `The body gives heights to a ${body.mode} write, which takes them only with scroll.`,
      )
    }
    const targets: HeightTarget[] = body.refs.map((ref) => {
      const expected = body.expected[ref]
      if (!expected) {
        throw new FrameboardError(
          'usage',
          `The body gives ${ref} no expected box.`,
          { ref },
        )
      }
      const height = body.heights?.[ref]
      return height === undefined
        ? { ref, expected }
        : { ref, expected, height }
    })
    await refuseLocked(body.refs)
    await refuseHeldFrames(body.refs)
    if (body.mode === 'fit') {
      if (!measure) {
        throw new FrameboardError(
          'browser-not-found',
          "Fit height needs the board server's browser, and none runs here.",
        )
      }
      for (const target of targets) {
        const frame = await readFrame(root, target.ref, { cwd })
        const content = await measure(frame)
        // A fit turns height hugging on with no write to the frame file,
        // which queues no hug measure, so each linked width is measured here.
        const widths: LinkedWidth[] = []
        for (const { width } of frame.widths) {
          const linked = await measure(frame, {
            width,
            height: referenceHeight(width),
          })
          widths.push({ width, height: linked.height })
        }
        target.measured = { height: content.height, widths }
      }
    }
    const frames = await recorded(
      (journal) => setHeightModes(root, targets, body.mode, { cwd, journal }),
      (records) => onFrames(records.map((record) => record.ref)),
    )
    return c.json({ ok: true, data: frames })
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

  // A section write moves no frame file or box, so no claim refuses it.
  app.post('/api/section/add', async (c) => {
    const body = await parseBody(c.req.raw, sectionAddSchema)
    const section = await recorded(
      (journal) =>
        addSection(root, body.page, {
          cwd,
          name: body.name,
          box: body.box,
          journal,
        }),
      () => onFrames([]),
    )
    return c.json({ ok: true, data: section })
  })

  app.post('/api/section/rename', async (c) => {
    const body = await parseBody(c.req.raw, sectionRenameSchema)
    const section = await recorded(
      (journal) =>
        renameSection(root, body.page, body.section, body.name, {
          cwd,
          journal,
        }),
      () => onFrames([]),
    )
    return c.json({ ok: true, data: section })
  })

  app.post('/api/section/delete', async (c) => {
    const body = await parseBody(c.req.raw, sectionSchema)
    const result = await recorded(
      (journal) =>
        deleteSection(root, body.page, body.section, { cwd, journal }),
      () => onFrames([]),
    )
    return c.json({ ok: true, data: result })
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

  /** Refuses a filing of any project another session holds, as rename does, before anything is written. */
  const refuseHeldProjects = async (refs: string[]) => {
    const projects = await Promise.all(
      refs.map((project) => resolveProject(root, project)),
    )
    await refuseHeld(projects.map((project) => project.name))
  }

  /** Files the named projects in one folder, a null group taking them out of theirs. */
  app.post('/api/project/group', async (c) => {
    const body = await parseBody(c.req.raw, projectGroupSchema)
    await refuseHeldProjects(body.refs)
    const projects = await recorded(
      (journal) =>
        fileProjects(root, body.refs, { group: body.group }, { journal }),
      onHome,
    )
    return c.json({ ok: true, data: projects })
  })

  /** Moves the named projects into home's Archived section, or back out of it. */
  app.post('/api/project/archive', async (c) => {
    const body = await parseBody(c.req.raw, projectArchiveSchema)
    await refuseHeldProjects(body.refs)
    const projects = await recorded(
      (journal) =>
        fileProjects(root, body.refs, { archived: body.archived }, { journal }),
      onHome,
    )
    return c.json({ ok: true, data: projects })
  })

  /**
   * Turns one check rule off for the project, or back on, as one undo step.
   * It waits on no claim, since it writes `project.json` alone and under its
   * lock. Turning off a rule no check declares answers `usage`.
   */
  app.post('/api/project/rule', async (c) => {
    const body = await parseBody(c.req.raw, projectRuleSchema)
    const rules = await recorded(
      (journal) =>
        setProjectRule(root, body.project, body.rule, body.off, { journal }),
      onHome,
    )
    return c.json({ ok: true, data: rules })
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
