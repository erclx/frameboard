import { existsSync } from 'node:fs'
import { constants, copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { FrameboardError } from '@/shared/errors'
import {
  FRAME_GAP,
  FRAME_SIZES,
  type FrameSizePreset,
} from '@/shared/frame-sizes'
import { nextFreeName } from '@/shared/names'
import type { LayoutFile } from '@/shared/records/board'
import type { FrameRecord } from '@/shared/records/list'

import type { Journal, JournalOptions } from './journal'
import { readRecord, withLocks, writeRecord } from './json-record'
import {
  assertValidName,
  matchName,
  type RefOptions,
  type ResolvedRef,
  resolveFrameRef,
  resolvePageRef,
} from './refs'
import {
  byStacking,
  FRAME_EXTENSION,
  LAYOUT_FILE,
  layoutSpec,
  listFrames,
  placeFrames,
  type Placement,
  readPageOrder,
  scanPage,
} from './scan'

export interface SizeOptions {
  size?: FrameSizePreset
  width?: number
  height?: number
}

export interface PositionOptions {
  x?: number
  y?: number
}

export type FrameFlag = 'hidden' | 'locked'

/**
 * Places a frame on its page, writing a skeleton file only when none exists.
 * A file with no entry keeps its bytes and takes the box `list` showed for it
 * unless a size or position is given.
 */
export async function addFrame(
  root: string,
  ref: string,
  options: RefOptions & SizeOptions & PositionOptions & JournalOptions,
): Promise<FrameRecord> {
  const { journal } = options
  const frame = await resolveFrameRef(root, ref, {
    ...options,
    allowMissing: true,
  })
  const size = sizeOf(options)
  const page = pageDir(frame)
  await withLayouts(
    [page],
    async (layouts) => {
      const layout = layoutAt(layouts, page)
      const exists = existsSync(frame.path)
      if (exists && layout.hasEntry(frame.name)) {
        throw new FrameboardError(
          'name-taken',
          `${frame.project}/${frame.page}/${frame.name} is already a placed frame.`,
          { ref: refOf(frame) },
        )
      }
      const names = exists ? layout.names : [...layout.names, frame.name].sort()
      const computed = placeFrames(layout.file.frames, names).get(frame.name)
      if (!computed) throw new Error(`No placement computed for ${frame.name}.`)
      if (!exists) {
        await writeFile(frame.path, skeleton(frame.name), { flag: 'wx' })
        await journal?.created(frame.path)
      }
      layout.names = names
      layout.set(frame.name, {
        ...computed,
        box: {
          ...computed.box,
          ...size,
          x: options.x ?? computed.box.x,
          y: options.y ?? computed.box.y,
        },
      })
      layout.renumber()
    },
    journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

/**
 * Copies the frame's file byte for byte, into its own page beside the source
 * or into `--to` at the source's box, on top of the target page.
 */
export async function duplicateFrame(
  root: string,
  ref: string,
  {
    to,
    name,
    journal,
    ...options
  }: RefOptions & JournalOptions & { to?: string; name?: string },
): Promise<FrameRecord> {
  const source = await resolveFrameRef(root, ref, options)
  const target = to ? await resolvePageRef(root, to, options) : undefined
  const from = pageDir(source)
  const into = target?.path ?? from
  const copy = await withLayouts(
    [from, into],
    async (layouts) => {
      const sourceLayout = layoutAt(layouts, from)
      const targetLayout = layoutAt(layouts, into)
      const copyName = freeFrameName(targetLayout.names, source.name, name)
      const placement = sourceLayout.placement(source.name)
      const box =
        into === from
          ? {
              ...placement.box,
              x: placement.box.x + placement.box.width + FRAME_GAP,
            }
          : placement.box
      const copyPath = join(into, `${copyName}${FRAME_EXTENSION}`)
      await copyFile(source.path, copyPath, constants.COPYFILE_EXCL)
      await journal?.created(copyPath)
      targetLayout.names = [...targetLayout.names, copyName].sort()
      targetLayout.set(copyName, {
        ...placement,
        box,
        order: targetLayout.topOrder(),
      })
      targetLayout.renumber()
      return copyName
    },
    journal,
  )
  const page = target ?? source
  return frameRecord(root, page.project, page.page, copy)
}

/**
 * Sets a frame's position, and with `--to` or `--name` carries its file to
 * another page or name, keeping its box. A move within the page writes the
 * layout alone.
 */
export async function moveFrame(
  root: string,
  ref: string,
  {
    to,
    name,
    x,
    y,
    journal,
    ...options
  }: RefOptions &
    PositionOptions &
    JournalOptions & { to?: string; name?: string },
): Promise<FrameRecord> {
  const source = await resolveFrameRef(root, ref, options)
  const target = to ? await resolvePageRef(root, to, options) : undefined
  const from = pageDir(source)
  const into = target?.path ?? from
  const moved = await withLayouts(
    [from, into],
    async (layouts) => {
      const sourceLayout = layoutAt(layouts, from)
      const targetLayout = layoutAt(layouts, into)
      const placement = sourceLayout.placement(source.name)
      const box = {
        ...placement.box,
        x: x ?? placement.box.x,
        y: y ?? placement.box.y,
      }

      const samePage = into === from
      const others = samePage
        ? targetLayout.names.filter((frame) => frame !== source.name)
        : targetLayout.names
      const movedName =
        samePage && name === undefined
          ? source.name
          : freeFrameName(others, source.name, name)

      if (samePage && movedName === source.name) {
        sourceLayout.set(source.name, { ...placement, box })
        return movedName
      }

      const movedPath = join(into, `${movedName}${FRAME_EXTENSION}`)
      if (journal) await journal.moved(source.path, movedPath)
      else await rename(source.path, movedPath)
      // The entry travels with the file, so keys a newer writer added survive the move.
      const carried = sourceLayout.file.frames[source.name]
      sourceLayout.remove(source.name)
      sourceLayout.names = sourceLayout.names.filter(
        (frame) => frame !== source.name,
      )
      targetLayout.names = [...others, movedName].sort()
      const order = samePage ? placement.order : targetLayout.topOrder()
      if (carried) targetLayout.file.frames[movedName] = { ...carried }
      targetLayout.set(movedName, { ...placement, box, order })
      sourceLayout.renumber()
      targetLayout.renumber()
      return movedName
    },
    journal,
  )
  const page = target ?? source
  return frameRecord(root, page.project, page.page, moved)
}

export async function renameFrame(
  root: string,
  ref: string,
  newName: string,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord> {
  return moveFrame(root, ref, { ...options, name: newName })
}

export async function resizeFrame(
  root: string,
  ref: string,
  options: RefOptions & SizeOptions & JournalOptions,
): Promise<FrameRecord> {
  const size = sizeOf(options)
  if (Object.keys(size).length === 0) {
    throw new FrameboardError(
      'usage',
      'Pass --size, --width, or --height to resize a frame.',
    )
  }
  return updatePlacement(root, ref, options, (placement) => ({
    ...placement,
    box: { ...placement.box, ...size },
  }))
}

type Box = FrameRecord['box']

/**
 * Sets the boxes of several frames on one page under one lock and one write,
 * the one path a hand move or resize takes. `expected` holds the boxes the
 * client started from, and a frame whose stored box differs from it refuses
 * the whole write, so a hand edit never silently undoes an agent's.
 */
export async function setBoxes(
  root: string,
  pageRef: string,
  boxes: Readonly<Record<string, Box>>,
  expected: Readonly<Record<string, Box>>,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord[]> {
  const page = await resolvePageRef(root, pageRef, options)
  const names = Object.keys(boxes)
  await withLayouts(
    [page.path],
    async (layouts) => {
      const layout = layoutAt(layouts, page.path)
      const placements = names.map((name) => {
        const ref = `${page.project}/${page.name}/${name}`
        if (!layout.names.includes(name)) {
          throw new FrameboardError('frame-not-found', `No frame ${ref}.`, {
            ref,
          })
        }
        const placement = layout.placement(name)
        if (placement.locked) {
          throw new FrameboardError('frame-locked', `${ref} is locked.`, {
            ref,
          })
        }
        const started = expected[name]
        if (!started || !sameBox(started, placement.box)) {
          throw new FrameboardError(
            'stale-layout',
            `${ref} moved since this edit began, so nothing was written.`,
            { ref, stored: placement.box, expected: started ?? null },
          )
        }
        return { name, placement, box: boxes[name] }
      })
      for (const { name, placement, box } of placements) {
        if (box) layout.set(name, { ...placement, box: { ...box } })
      }
    },
    options.journal,
  )
  const frames = await frameRecords(root, page.project, page.name)
  return frames.filter((frame) => names.includes(frame.name))
}

function sameBox(a: Box, b: Box): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

/** Moves a frame to `index` in the page's stacking order, 0 at the bottom, clamped. */
export async function orderFrame(
  root: string,
  ref: string,
  { index, ...options }: RefOptions & JournalOptions & { index: number },
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  const page = pageDir(frame)
  await withLayouts(
    [page],
    async (layouts) => {
      const layout = layoutAt(layouts, page)
      const stack = layout.stack().filter((name) => name !== frame.name)
      const at = Math.max(0, Math.min(index, stack.length))
      stack.splice(at, 0, frame.name)
      for (const [order, name] of stack.entries()) {
        layout.set(name, { ...layout.placement(name), order })
      }
    },
    options.journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

export async function setFrameFlag(
  root: string,
  ref: string,
  flag: FrameFlag,
  { on, ...options }: RefOptions & JournalOptions & { on: boolean },
): Promise<FrameRecord> {
  return updatePlacement(root, ref, options, (placement) => ({
    ...placement,
    [flag]: on,
  }))
}

export async function deleteFrame(
  root: string,
  ref: string,
  options: RefOptions & JournalOptions,
): Promise<{ deleted: string }> {
  const { journal } = options
  const frame = await resolveFrameRef(root, ref, options)
  const page = pageDir(frame)
  await withLayouts(
    [page],
    async (layouts) => {
      const layout = layoutAt(layouts, page)
      if (journal) await journal.removed(frame.path)
      else await rm(frame.path)
      layout.remove(frame.name)
    },
    journal,
  )
  return { deleted: refOf(frame) }
}

async function updatePlacement(
  root: string,
  ref: string,
  options: RefOptions & JournalOptions,
  change: (placement: Placement) => Placement,
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  const page = pageDir(frame)
  await withLayouts(
    [page],
    async (layouts) => {
      const layout = layoutAt(layouts, page)
      layout.set(frame.name, change(layout.placement(frame.name)))
    },
    options.journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

/** The size a verb sets, from a preset or from explicit width and height. */
export function sizeOf({ size, width, height }: SizeOptions): {
  width?: number
  height?: number
} {
  if (size !== undefined && (width !== undefined || height !== undefined)) {
    throw new FrameboardError(
      'usage',
      'Pass --size or --width and --height, not both.',
      { size, width, height },
    )
  }
  if (size !== undefined) return { ...FRAME_SIZES[size] }
  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

/**
 * The skeleton states `head` with `body`, so the browser builds neither and
 * every element address in the file holds.
 */
export function skeleton(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
  </head>
  <body></body>
</html>
`
}

/** One page's layout as read under its lock, with the frame files beside it. */
class PageLayout {
  changed = false

  constructor(
    readonly file: LayoutFile,
    public names: string[],
  ) {}

  hasEntry(name: string): boolean {
    return Object.hasOwn(this.file.frames, name)
  }

  /** The frame's placement as `list` shows it, computed when it has no entry. */
  placement(name: string): Placement {
    const placement = placeFrames(this.file.frames, this.names).get(name)
    if (!placement) throw new Error(`No frame ${name} on this page.`)
    return placement
  }

  /** Frame names bottom to top, unplaced ones included at their computed order. */
  stack(): string[] {
    const placements = placeFrames(this.file.frames, this.names)
    return [...placements]
      .map(([name, { order }]) => ({ name, order }))
      .sort(byStacking)
      .map(({ name }) => name)
  }

  topOrder(): number {
    return Math.max(
      ...this.names.map((name) => this.placement(name).order + 1),
      0,
    )
  }

  /**
   * Writes all seven keys on the entry it creates or changes, after any key
   * the entry already held, so unknown keys survive in place.
   */
  set(name: string, { box, order, hidden, locked }: Placement): void {
    this.file.frames[name] = {
      ...this.file.frames[name],
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      order,
      hidden,
      locked,
    }
    this.changed = true
  }

  remove(name: string): void {
    delete this.file.frames[name]
    this.changed = true
  }

  /** Renumbers the page's placed frames densely from 0, touching only entries whose order moves. */
  renumber(): void {
    const placed = this.stack().filter((name) => this.hasEntry(name))
    for (const [order, name] of placed.entries()) {
      const placement = this.placement(name)
      if (placement.order !== order) this.set(name, { ...placement, order })
    }
  }
}

/**
 * Runs one frame change under the lock of every page it touches, taken in
 * path order. Every layout is read and validated before `run` moves a file,
 * and only the layouts it changed are written, reporting each entry that
 * differs to the journal.
 */
export async function withLayouts<T>(
  pages: string[],
  run: (layouts: Map<string, PageLayout>) => Promise<T>,
  journal?: Journal,
): Promise<T> {
  const unique = [...new Set(pages)]
  const paths = unique.map((page) => join(page, LAYOUT_FILE))
  return withLocks(paths, async () => {
    const layouts = new Map<string, PageLayout>()
    const read = new Map<string, LayoutFile>()
    for (const page of unique) {
      const file = await readRecord(join(page, LAYOUT_FILE), layoutSpec)
      read.set(page, file)
      layouts.set(
        page,
        new PageLayout(structuredClone(file), await listFrames(page)),
      )
    }
    const result = await run(layouts)
    for (const [page, layout] of layouts) {
      if (!layout.changed) continue
      await writeRecord(join(page, LAYOUT_FILE), layout.file)
      if (journal) reportEntries(journal, page, read.get(page), layout.file)
    }
    return result
  })
}

function reportEntries(
  journal: Journal,
  page: string,
  before: LayoutFile | undefined,
  after: LayoutFile,
): void {
  const was = before?.frames ?? {}
  for (const frame of new Set([
    ...Object.keys(was),
    ...Object.keys(after.frames),
  ])) {
    const from = was[frame]
    const to = after.frames[frame]
    if (!isDeepStrictEqual(from, to)) journal.entry(page, frame, from, to)
  }
}

function layoutAt(layouts: Map<string, PageLayout>, page: string): PageLayout {
  const layout = layouts.get(page)
  if (!layout) throw new Error(`No layout read for ${page}.`)
  return layout
}

/** The explicit name when free and valid, else the next free copy of the source's. */
export function freeFrameName(
  taken: string[],
  base: string,
  name: string | undefined,
): string {
  if (name === undefined) return nextFreeName(base, taken)
  assertValidName('frame', name)
  const holder = matchName(taken, name)
  if (holder) {
    throw new FrameboardError(
      'name-taken',
      `The page already has a frame ${holder}.`,
      { name, taken: holder },
    )
  }
  return name
}

/** The frame a ref names, as `list` shows it. */
export async function readFrame(
  root: string,
  ref: string,
  options: RefOptions,
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  return frameRecord(root, frame.project, frame.page, frame.name)
}

async function frameRecord(
  root: string,
  project: string,
  page: string,
  name: string,
): Promise<FrameRecord> {
  const frame = (await frameRecords(root, project, page)).find(
    (candidate) => candidate.name === name,
  )
  if (!frame) throw new Error(`Frame ${name} vanished from ${project}/${page}.`)
  return frame
}

async function frameRecords(
  root: string,
  project: string,
  page: string,
): Promise<FrameRecord[]> {
  const { pages } = await readPageOrder(join(root, project))
  return (await scanPage(root, project, page, pages.indexOf(page))).frames
}

function pageDir(frame: ResolvedRef): string {
  return join(frame.root, frame.project, frame.page)
}

function refOf(frame: ResolvedRef): string {
  return `${frame.project}/${frame.page}/${frame.name}`
}
