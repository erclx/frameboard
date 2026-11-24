import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveAsset } from '@/server/board/assets'
import { layoutAt, withLayouts } from '@/server/board/frames'
import { resolveFrameRef } from '@/server/board/refs'
import {
  frameFrom,
  type FrameTarget,
  readFrame,
  type Sheet,
} from '@/server/checks/frame-source'
import { frameKit, readSheets } from '@/server/checks/tokens'
import { refuseClaimed } from '@/server/claims/gate'
import { readClaims } from '@/server/claims/store'
import { contentHash } from '@/server/edit/address'
import { applyEdit } from '@/server/edit/apply'
import { elementPlaceFacts } from '@/server/edit/elements'
import {
  editFrameFile,
  editFrameFileAll,
  extractFrameFile,
  insertFrameFile,
  moveFrameFile,
  placeFrameFile,
  placeFrameFileAll,
  type PlaceInserted,
  recolorFrameFile,
  type Remap,
  removeFrameFile,
  removeFrameFileAll,
  wrapFrameFile,
} from '@/server/edit/frame-file'
import { mayShow } from '@/server/edit/hide'
import {
  assetTag,
  elementMarkup,
  type InsertKind,
  textFont,
} from '@/server/edit/insert'
import { placeElement, standInFlow } from '@/server/edit/place'
import type { History } from '@/server/history/stack'
import { styleValue } from '@/server/look/colors'
import { readTokenTable } from '@/server/look/token-table'
import { ensureViewer } from '@/server/models/viewer'
import { followEdit, notesPath } from '@/server/notes/store'
import { FRAME_EXTENSION } from '@/shared/board-files'
import { VIEWER_TAG } from '@/shared/model-viewer'
import { elementFrameName, nextFreeName } from '@/shared/names'
import {
  type EditResult,
  type ExtractResult,
  type InsertResult,
  type MoveResult,
  placedSizeSchema,
  type PlaceResult,
  type RecolorResult,
  type RemoveResult,
  type WrapResult,
} from '@/shared/records/edit'
import { shapePaint } from '@/shared/shape-paint'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import type { FrameLook } from './frames'

// Bounds the body alone. The writer refuses a value past its own limit as `invalid-edit`.
const value = z.string().max(10_000)
const name = z.string().min(1).max(256)
/** A dragged shape's side in CSS pixels. */
const side = z.int().min(1).max(10_000)
/** A spot in CSS pixels, bounded well past any frame. */
const offset = z.number().min(-100_000).max(100_000)

/** How many elements one batch names, well past any selection a hand makes. */
const BATCH = 1024

// A plain union, since the two attribute members share a kind. Both are
// strict, so a body naming `value` and `remove` together is refused rather
// than read as whichever member parses first.
const changeSchema = z.union([
  z.object({ kind: z.literal('style'), property: name, value }),
  z.strictObject({ kind: z.literal('attribute'), name, value }),
  z.strictObject({
    kind: z.literal('attribute'),
    name,
    remove: z.literal(true),
  }),
  z.object({
    kind: z.literal('text'),
    value,
    run: z.int().min(0).optional(),
  }),
  z.object({
    kind: z.literal('styles'),
    declarations: z.array(z.object({ property: name, value })).max(16),
  }),
])

const hiddenSchema = z.object({
  kind: z.literal('hidden'),
  value: z.boolean(),
})

const editSchema = z.union([
  z.object({
    ref: z.string().min(1).max(1024),
    index: z.int().min(0),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    change: changeSchema,
  }),
  z.object({
    ref: z.string().min(1).max(1024),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    edits: z
      .array(
        z.object({
          index: z.int().min(0),
          change: z.union([changeSchema, hiddenSchema]),
        }),
      )
      .min(1)
      .max(BATCH),
  }),
])

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
  /** Where the element lands out of the flow, against the box it counts from, else it joins the flow at the gap. */
  at: z
    .object({
      left: offset,
      top: offset,
      /** Joins the flow at the gap instead when placing would move another element anchored above the parent. */
      orFlow: z.boolean().optional(),
    })
    .optional(),
})

const removeSchema = z.union([
  z.object({
    ref: z.string().min(1).max(1024),
    index: z.int().min(0),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({
    ref: z.string().min(1).max(1024),
    indexes: z.array(z.int().min(0)).min(1).max(BATCH),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
])

const extractSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  index: z.int().min(0),
  /** Where the new frame stands, its size holding until the frame is measured. */
  box: z.object({ x: z.int(), y: z.int(), width: side, height: side }),
})

const moveSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  index: z.int().min(0),
  parent: z.int().min(0),
  before: z.int().min(0).nullable(),
})

const spotFields = {
  spot: z
    .object({
      left: offset,
      top: offset,
      width: side.optional(),
      height: side.optional(),
    })
    .nullable(),
  /** Back in flow, the sizes to drop, being ones a placement wrote that nothing changed since. */
  drop: z.array(placedSizeSchema).max(2).optional(),
}

const placeSchema = z.union([
  z.object({
    ref: z.string().min(1).max(1024),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    index: z.int().min(0),
    ...spotFields,
  }),
  z.object({
    ref: z.string().min(1).max(1024),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    places: z
      .array(z.object({ index: z.int().min(0), ...spotFields }))
      .min(1)
      .max(BATCH),
  }),
])

const wrapSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The sibling elements to wrap, by their index in the bytes `hash` names. */
  indexes: z.array(z.int().min(0)).min(1).max(BATCH),
  flow: z.object({
    direction: z.enum(['row', 'column']),
    gap: z.number().min(0).max(10_000),
  }),
  /** Where the container sits when every member was placed freely, null to sit in the flow. */
  spot: z.object({ left: offset, top: offset }).nullable(),
})

const recolorSchema = z.object({
  ref: z.string().min(1).max(1024),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The selected element, whose subtree the replace covers, or none for the whole frame. */
  index: z.int().min(0).optional(),
  /** A raw color as Selection colors lists it, never a token. */
  from: z.object({
    value: z
      .string()
      .min(1)
      .max(200)
      .refine((written) => styleValue(written).token === null, {
        message: 'from is a raw color, not a token',
      }),
    percent: z.int().min(0).max(100),
  }),
  /** A color token's custom property, with its leading `--`. */
  to: z.string().regex(/^--[\w-]+$/),
})

/** The source a frame held under a hash an agent's write replaced, or null when none is kept. */
export type SettledVersion = (
  ref: string,
  hash: string,
) => Promise<string | null>

/**
 * The hand element writes, each naming the rendered `hash` and recording one
 * undo step, a batch refused whole. An insert takes a kind, never markup.
 */
export function editRoutes(
  root: string,
  access: Access,
  history: History,
  version?: SettledVersion,
  sheets?: FrameLook['sheets'],
): Hono {
  const app = new Hono()

  /** Carries the frame's notes from `before` to `after`, a write that changed no byte carrying none. */
  const follow = (
    frame: { project: string; page: string; name: string },
    before: string,
    after: string,
    remap: Remap,
  ): Promise<void> =>
    before === after
      ? Promise.resolve()
      : followEdit(
          notesPath(root, frame.project, frame.page),
          frame.name,
          before,
          after,
          remap,
        )

  app.post('/api/frames/edit', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, editSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    // The lookup waits on the scan turn, so an edit on the file's own hash skips it.
    const moved = contentHash(await readFile(frame.path)) !== body.hash
    const was = moved ? ((await version?.(ref, body.hash)) ?? null) : null
    if ('edits' in body) {
      const result = editFrameFileAll(
        frame.path,
        body.hash,
        body.edits,
        (hash) => (hash === body.hash ? was : null),
        (html, index) =>
          mayShow(frameFrom(frame, html), tokenSheets(frame), index),
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
                ...('moved' in result ? { moved: result.moved } : {}),
              },
            },
          },
          409,
        )
      }
      // Edits that leave the bytes as they were record nothing to undo.
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
      await follow(frame, result.from, result.hash, result.remap)
      const data: EditResult = {
        ref,
        index: result.indexes.at(-1) ?? 0,
        indexes: [...result.indexes],
        hash: result.hash,
        from: result.from,
      }
      return c.json({ ok: true, data })
    }
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
    await follow(frame, result.from, result.hash, result.remap)
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
      element = { ...body.element, tag: assetTag(asset.kind) }
    }
    const viewer = element.kind === 'asset' && element.tag === VIEWER_TAG
    // Ahead of the frame's write, so the script its head links is never missing.
    if (viewer) await ensureViewer(join(root, frame.project))
    const { at } = body
    const insert = (place?: PlaceInserted) =>
      insertFrameFile(
        frame.path,
        body.hash,
        { parent: body.parent, before: body.before },
        elementMarkup(element, shapePaint(tokens), textFont(tokens)),
        place,
        viewer,
      )
    const placed =
      at &&
      insert((html, index) => {
        // A paragraph's own margin would push it off the point it was placed at.
        const bare =
          element.kind === 'text'
            ? applyEdit(
                html,
                { index },
                { kind: 'style', property: 'margin', value: '0' },
              )
            : { ok: true as const, html }
        if (!bare.ok) return bare
        const facts = elementPlaceFacts(
          frameFrom(frame, bare.html),
          tokenSheets(frame),
        )
        return placeElement(
          bare.html,
          index,
          { left: at.left, top: at.top },
          facts,
        )
      })
    // A refused placement wrote nothing, so the flow insert goes from the same bytes.
    const result =
      !placed ||
      (!placed.ok && placed.reason === 'reanchors-descendant' && at.orFlow)
        ? insert()
        : placed
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
    if (result.parent) journal.element(frame.path, ref, result.parent)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref],
    })
    await follow(frame, body.hash, result.hash, result.remap)
    const data: InsertResult = { ref, index: result.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/remove', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, removeSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    if ('indexes' in body) {
      const result = removeFrameFileAll(frame.path, body.hash, body.indexes)
      if (!result.ok) {
        return c.json(
          {
            ok: false,
            error: {
              code: result.reason,
              message: result.detail,
              details: { ref },
            },
          },
          409,
        )
      }
      const journal = history.journal()
      journal.deletedElements(frame.path, ref, result.spans)
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [ref],
      })
      await follow(frame, body.hash, result.hash, result.remap)
      const data: RemoveResult = { ref, hash: result.hash }
      return c.json({ ok: true, data })
    }
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
    await follow(frame, body.hash, result.hash, result.remap)
    const data: RemoveResult = { ref, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/extract', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, extractSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const pageRef = `${frame.project}/${frame.page}`
    const ref = `${pageRef}/${frame.name}`
    const now = new Date()
    await refuseClaimed(root, [ref], now)
    // A name an agent reserved is held, so its later file never overwrites this one.
    const reserved = (await readClaims(root, now)).flatMap((claim) =>
      claim.frame.startsWith(`${pageRef}/`)
        ? [claim.frame.slice(pageRef.length + 1)]
        : [],
    )
    const page = dirname(frame.path)
    const journal = history.journal()
    let name = ''
    const result = await withLayouts(
      [page],
      async (layouts) => {
        const layout = layoutAt(layouts, page)
        const { kit } = layout.placement(frame.name)
        const taken = [
          ...layout.names,
          ...Object.keys(layout.file.frames),
          ...reserved,
        ]
        const extracted = await extractFrameFile(
          frame.path,
          body.hash,
          body.index,
          (element) => {
            name = nextFreeName(
              elementFrameName(element.name, element.tagName),
              taken,
            )
            const stood = standInFlow(
              element.frame,
              element.index,
              elementPlaceFacts(
                frameFrom(frame, element.frame),
                tokenSheets(frame),
              ),
            )
            if (!stood.ok) return stood
            const path = join(page, `${name}${FRAME_EXTENSION}`)
            return { ok: true, path, html: stood.html }
          },
          (path) => journal.created(path),
        )
        if (!extracted.ok) return extracted
        journal.deletedElement(frame.path, ref, extracted.span)
        layout.names = [...layout.names, name].sort()
        layout.set(name, {
          box: body.box,
          order: layout.topOrder(),
          hidden: false,
          locked: false,
          hugWidth: true,
          hugHeight: true,
          scroll: false,
          widths: [],
          placed: true,
          // The kit's sheets load from the layout, so the copied head alone would drop them.
          ...(kit ? { kit } : {}),
        })
        layout.renumber()
        return extracted
      },
      journal,
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
    const own = `${pageRef}/${name}`
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref, own],
    })
    await follow(frame, body.hash, result.hash, result.remap)
    const data: ExtractResult = { ref, hash: result.hash, frame: own }
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
    await follow(frame, body.hash, result.hash, result.remap)
    const data: MoveResult = { ref, index: result.index, hash: result.hash }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/place', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, placeSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    if ('places' in body) {
      const result = placeFrameFileAll(
        frame.path,
        body.hash,
        body.places.map(({ index, spot, drop }) => ({
          index,
          spot,
          drop: spot ? [] : (drop ?? []),
        })),
        (html) => elementPlaceFacts(frameFrom(frame, html), tokenSheets(frame)),
      )
      if (!result.ok) {
        return c.json(
          {
            ok: false,
            error: {
              code: result.reason,
              message: result.detail,
              details: { ref },
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
      await follow(frame, body.hash, result.hash, result.remap)
      const placed = body.places.map(({ index }, at) => ({
        index,
        sized: [...(result.sized[at] ?? [])],
      }))
      const data: PlaceResult = {
        ref,
        index: placed.at(-1)?.index ?? 0,
        hash: result.hash,
        sized: placed.at(-1)?.sized ?? [],
        placed,
      }
      return c.json({ ok: true, data })
    }
    const source = readFrame(frame)
    // Facts read from other bytes than the hash names would pick the wrong tags.
    const facts =
      contentHash(source.html) === body.hash
        ? elementPlaceFacts(source, tokenSheets(frame))
        : []
    const result = placeFrameFile(
      frame.path,
      body.hash,
      body.index,
      body.spot,
      facts,
      body.spot ? [] : (body.drop ?? []),
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
    await follow(frame, body.hash, result.hash, result.remap)
    const data: PlaceResult = {
      ref,
      index: body.index,
      hash: result.hash,
      sized: [...result.sized],
    }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/wrap', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, wrapSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const source = readFrame(frame)
    // Facts read from other bytes than the hash names would pick the wrong tags.
    const facts =
      contentHash(source.html) === body.hash
        ? elementPlaceFacts(source, tokenSheets(frame))
        : []
    const result = wrapFrameFile(
      frame.path,
      body.hash,
      body.indexes,
      body.flow,
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
            details: { ref, indexes: body.indexes },
          },
        },
        409,
      )
    }
    const journal = history.journal()
    journal.element(frame.path, ref, result.span)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [ref],
    })
    await follow(frame, body.hash, result.hash, result.remap)
    const data: WrapResult = {
      ref,
      index: result.index,
      members: [...result.members],
      hash: result.hash,
    }
    return c.json({ ok: true, data })
  })

  app.post('/api/frames/recolor', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, recolorSchema)
    const frame = await resolveFrameRef(root, body.ref, { cwd: root })
    const ref = `${frame.project}/${frame.page}/${frame.name}`
    await refuseClaimed(root, [ref], new Date())
    const tokens = sheets
      ? readTokenTable(root, sheets(frame.project)).tokens
      : []
    if (!tokens.some((row) => row.group === 'color' && row.name === body.to)) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'unknown-token',
            message: `${body.to} is not one of ${frame.project}'s color tokens, so nothing was written`,
            details: { ref, to: body.to },
          },
        },
        409,
      )
    }
    const result = recolorFrameFile(frame.path, body.hash, body.index, {
      from: body.from,
      token: body.to,
    })
    if (!result.ok) {
      return c.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: result.detail,
            details: { ref, index: body.index ?? null },
          },
        },
        409,
      )
    }
    if (result.spans.length > 0) {
      const journal = history.journal()
      for (const span of result.spans) journal.element(frame.path, ref, span)
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [ref],
      })
    }
    await follow(frame, body.hash, result.hash, result.remap)
    const data: RecolorResult = {
      ref,
      hash: result.hash,
      count: result.spans.length,
    }
    return c.json({ ok: true, data })
  })

  /** The sheets the frame renders with ahead of its own, as the frame route imports them. */
  const tokenSheets = (frame: FrameTarget): Sheet[] =>
    sheets
      ? readSheets(root, frame.project, sheets(frame.project), frameKit(frame))
      : []

  app.onError(answerRefusal)

  return app
}
