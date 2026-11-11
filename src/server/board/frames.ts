import { existsSync } from 'node:fs'
import { constants, copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { FrameboardError } from '@/shared/errors'
import {
  FRAME_GAP,
  type FrameSizeName,
  frameSizeOf,
  referenceHeight,
} from '@/shared/frame-sizes'
import { drawnExtent, type LinkedWidth, widthsOf } from '@/shared/frame-widths'
import { nextFreeName } from '@/shared/names'
import type {
  LayoutEntry,
  LayoutFile,
  SectionEntry,
} from '@/shared/records/board'
import type { FrameRecord } from '@/shared/records/list'

import { reservedBox } from '../claims/store'
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
  size?: FrameSizeName
  width?: number
  height?: number
}

export interface PositionOptions {
  x?: number
  y?: number
}

export interface ScrollOptions {
  /** On to hold a screen height and scroll past it, off to clear the key, absent to leave it. */
  scroll?: boolean
}

export interface WidthsOptions {
  /** The extra widths the frame also shows at, `false` to clear them, absent to leave them. */
  widths?: readonly number[] | false
}

export type FrameFlag = 'hidden' | 'locked'

/**
 * Places a frame on its page, writing a skeleton file only when none exists.
 * A file with no entry keeps its bytes and lands 80 past the placed frames,
 * as `placeNext` puts it, ignoring the page's other unplaced files, unless a
 * size or position is given. Every axis no size names hugs its
 * content, a preset fixing the width alone, and the box stands in until the
 * server measures. A scroll frame hugs neither axis, and with no height named
 * takes the reference height of its width.
 */
export async function addFrame(
  root: string,
  ref: string,
  options: RefOptions &
    SizeOptions &
    PositionOptions &
    ScrollOptions &
    WidthsOptions &
    JournalOptions,
): Promise<FrameRecord> {
  const { journal } = options
  const frame = await resolveFrameRef(root, ref, {
    ...options,
    allowMissing: true,
  })
  const page = pageDir(frame)
  const reserved =
    options.x === undefined && options.y === undefined
      ? await reservedBox(root, refOf(frame))
      : undefined
  const sized =
    options.size !== undefined ||
    options.width !== undefined ||
    options.height !== undefined
  // A reserved frame lands in its box, as the server's landing step puts it.
  const size =
    reserved && !sized
      ? { width: reserved.width, height: reserved.height }
      : sizeOf(options)
  const scroll = options.scroll ?? false
  const hugs = scroll
    ? { hugWidth: false, hugHeight: false }
    : reserved && !sized
      ? {
          hugWidth: reserved.hugWidth ?? false,
          hugHeight: reserved.hugHeight ?? false,
        }
      : hugsOf(options)
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
      // Another unplaced file would take a slot ahead of this one, so the
      // frame lands past the placed frames alone.
      const slot = names.filter(
        (name) => name === frame.name || layout.hasEntry(name),
      )
      const computed = placeFrames(layout.file.frames, slot).get(frame.name)
      if (!computed) throw new Error(`No placement computed for ${frame.name}.`)
      const width = size.width ?? computed.box.width
      // Refused ahead of the skeleton, so a refusal leaves no file behind.
      const widths = linkedWidths(refOf(frame), options.widths, {
        width,
        hugWidth: hugs.hugWidth,
        held: [],
      })
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
          ...(scroll && size.height === undefined
            ? { height: referenceHeight(width) }
            : {}),
          x: options.x ?? reserved?.x ?? computed.box.x,
          y: options.y ?? reserved?.y ?? computed.box.y,
        },
        ...hugs,
        scroll,
        widths,
      })
      layout.renumber()
    },
    journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

/**
 * Copies the frame's file byte for byte, into its own page beside the source
 * or into `--to` at the source's box, on top of the target page. An `offset`
 * places the copy that far from the source's box instead, as an Alt-drag
 * drops it.
 */
export async function duplicateFrame(
  root: string,
  ref: string,
  {
    to,
    name,
    offset,
    journal,
    ...options
  }: RefOptions &
    JournalOptions & {
      to?: string
      name?: string
      offset?: { x: number; y: number }
    },
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
      const box = offset
        ? {
            ...placement.box,
            x: placement.box.x + offset.x,
            y: placement.box.y + offset.y,
          }
        : into === from
          ? { ...placement.box, x: pastExtent(placement) }
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

/**
 * Sets the size each option names and fixes those axes. `scroll` on fixes
 * both, dropping a hugging height no option names to the reference height of
 * the width, since a frame kept at its content's full height has nothing to
 * scroll. `scroll` off clears the key and keeps the box as it stands.
 */
export async function resizeFrame(
  root: string,
  ref: string,
  options: RefOptions &
    SizeOptions &
    ScrollOptions &
    WidthsOptions &
    JournalOptions,
): Promise<FrameRecord> {
  const size = sizeOf(options)
  if (
    Object.keys(size).length === 0 &&
    options.scroll === undefined &&
    options.widths === undefined
  ) {
    throw new FrameboardError(
      'usage',
      'Pass --size, --width, --height, --scroll, --no-scroll, --widths, or --no-widths to resize a frame.',
    )
  }
  return updatePlacement(root, ref, options, (placement, frameRef) => {
    const scroll = options.scroll ?? placement.scroll
    const width = size.width ?? placement.box.width
    const drops = scroll && placement.hugHeight && size.height === undefined
    const hugWidth = !scroll && placement.hugWidth && size.width === undefined
    const widths = linkedWidths(
      frameRef,
      options.widths ?? placement.widths.map((linked) => linked.width),
      { width, hugWidth, held: placement.widths },
    )
    return {
      ...placement,
      box: {
        ...placement.box,
        ...size,
        ...(drops ? { height: referenceHeight(width) } : {}),
      },
      hugWidth,
      hugHeight: !scroll && placement.hugHeight && size.height === undefined,
      scroll,
      // A hugging height dropped to a screen height takes each linked width
      // to its own, so every view of a scroll frame scrolls.
      widths: drops
        ? widths.map((linked) => ({
            ...linked,
            height: referenceHeight(linked.width),
          }))
        : widths,
    }
  })
}

/**
 * The linked widths a verb writes, keeping the height each one already held
 * and giving a new one the reference height of its width, which a hugging
 * frame's measure replaces. A repeated width, the frame's own width, or a
 * frame hugging its width refuses `usage`.
 */
export function linkedWidths(
  ref: string,
  requested: readonly number[] | false | undefined,
  {
    width,
    hugWidth,
    held,
  }: { width: number; hugWidth: boolean; held: readonly LinkedWidth[] },
): LinkedWidth[] {
  if (!requested || requested.length === 0) return []
  if (hugWidth) {
    throw new FrameboardError(
      'usage',
      `${ref} hugs its width, so it has no width to show beside others. Fix it with --size or --width first.`,
      { ref, widths: requested },
    )
  }
  const repeated = requested.find(
    (linked, index) => requested.indexOf(linked) !== index,
  )
  if (repeated !== undefined) {
    throw new FrameboardError(
      'usage',
      `--widths lists ${repeated} twice, so pass each width once.`,
      { ref, widths: requested },
    )
  }
  if (requested.includes(width)) {
    throw new FrameboardError(
      'usage',
      `${ref} is ${width} px wide already, so --widths lists the other widths alone.`,
      { ref, width, widths: requested },
    )
  }
  return requested.map((linked) => ({
    width: linked,
    height:
      held.find((each) => each.width === linked)?.height ??
      referenceHeight(linked),
  }))
}

/** The x a copy placed beside a frame takes, past the row of linked widths it draws. */
export function pastExtent({ box, widths }: Placement): number {
  const extent = drawnExtent(box, widths)
  return extent.x + extent.width + FRAME_GAP
}

/**
 * Sets a frame's height to its content's measured height and turns hugging
 * back on for that axis, the inverse of the resize that fixed it, writing
 * each linked width's measured height beside it while the entry lists it. A
 * scroll frame refuses `fit-scroll`, since its height is fixed on purpose.
 */
export async function fitHeight(
  root: string,
  ref: string,
  height: number,
  options: RefOptions & JournalOptions & { widths?: readonly LinkedWidth[] },
): Promise<FrameRecord> {
  return updatePlacement(root, ref, options, (placement) => {
    if (placement.scroll) throw fitScrollError(ref)
    return {
      ...placement,
      box: { ...placement.box, height },
      hugHeight: true,
      widths: placement.widths.map((linked) => ({
        ...linked,
        height:
          options.widths?.find((each) => each.width === linked.width)?.height ??
          linked.height,
      })),
    }
  })
}

/** The refusal a fit of a scroll frame answers, before or after measuring. */
export function fitScrollError(ref: string): FrameboardError {
  return new FrameboardError(
    'fit-scroll',
    `${ref} holds scroll, which fixes its height so the page scrolls past it, so it has no height to fit. Clear it with frame resize --no-scroll first.`,
    { ref },
  )
}

/**
 * Writes the sizes the server measured, on the axes each frame's stored entry
 * hugs and nowhere else, under the page's lock. It sets no flag and takes no
 * journal, since the developer never set that size, and answers the names
 * whose entry changed, none when every size already stands.
 */
export async function setMeasured(
  root: string,
  pageRef: string,
  sizes: Readonly<Record<string, MeasuredSize>>,
  options: RefOptions,
): Promise<string[]> {
  const page = await resolvePageRef(root, pageRef, options)
  return withLayouts([page.path], async (layouts) => {
    const layout = layoutAt(layouts, page.path)
    const written: string[] = []
    for (const [name, size] of Object.entries(sizes)) {
      if (!layout.hasEntry(name) || !layout.names.includes(name)) continue
      const placement = layout.placement(name)
      const box = {
        ...placement.box,
        width:
          placement.hugWidth && size.width !== undefined
            ? size.width
            : placement.box.width,
        height:
          placement.hugHeight && size.height !== undefined
            ? size.height
            : placement.box.height,
      }
      // A linked width takes its measure only while the stored entry still
      // lists it and the frame still hugs its height.
      const widths = placement.widths.map((linked) => ({
        ...linked,
        height: placement.hugHeight
          ? (size.widths?.find((each) => each.width === linked.width)?.height ??
            linked.height)
          : linked.height,
      }))
      if (
        sameBox(box, placement.box) &&
        isDeepStrictEqual(widths, placement.widths)
      ) {
        continue
      }
      layout.set(name, { ...placement, box, widths })
      written.push(name)
    }
    return written
  })
}

/**
 * What one measure of a frame read, each part absent when it was not read:
 * the frame's own box, and the height of each linked width measured.
 */
export interface MeasuredSize {
  width?: number
  height?: number
  widths?: readonly LinkedWidth[]
}

type Box = FrameRecord['box']

export interface SectionBoxes {
  /** Section boxes by name, written beside the frame boxes in the same write. */
  sections?: Readonly<Record<string, Box>>
  /** The section boxes the client started from, refusing the write as a frame's does. */
  expectedSections?: Readonly<Record<string, Box>>
}

/**
 * Sets the boxes of several frames on one page under one lock and one write,
 * the one path a hand move or resize takes. `expected` holds the boxes the
 * client started from, and a frame whose stored box differs from it refuses
 * the whole write, so a hand edit never silently undoes an agent's. A section
 * move carries its box in `sections` beside its members' boxes, so the box
 * and the frames move as one step or not at all.
 */
export async function setBoxes(
  root: string,
  pageRef: string,
  boxes: Readonly<Record<string, Box>>,
  expected: Readonly<Record<string, Box>>,
  options: RefOptions & JournalOptions & SectionBoxes,
): Promise<FrameRecord[]> {
  const page = await resolvePageRef(root, pageRef, options)
  const names = Object.keys(boxes)
  await withLayouts(
    [page.path],
    async (layouts) => {
      const layout = layoutAt(layouts, page.path)
      const sections = Object.entries(options.sections ?? {}).map(
        ([name, box]) => {
          const ref = `${page.project}/${page.name}`
          const entry = layout.section(name)
          if (!entry) {
            throw new FrameboardError(
              'section-not-found',
              `No section ${name} on ${ref}.`,
              { page: ref, name },
            )
          }
          const started = options.expectedSections?.[name]
          if (!started || !sameBox(started, entry)) {
            throw new FrameboardError(
              'stale-layout',
              `Section ${name} moved since this edit began, so nothing was written.`,
              {
                page: ref,
                name,
                stored: boxOf(entry),
                expected: started ?? null,
              },
            )
          }
          return { name, entry, box }
        },
      )
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
        const box = boxes[name]
        const kept = box && started ? measuredAxes(placement, box, started) : {}
        if (!started || !sameBox({ ...started, ...kept }, placement.box)) {
          throw new FrameboardError(
            'stale-layout',
            `${ref} moved since this edit began, so nothing was written.`,
            { ref, stored: placement.box, expected: started ?? null },
          )
        }
        return { name, placement, box, kept, started }
      })
      for (const { name, entry, box } of sections) {
        layout.setSection(name, { ...entry, ...box })
      }
      for (const { name, placement, box, kept, started } of placements) {
        if (!box || !started) continue
        layout.set(name, {
          ...placement,
          box: { ...box, ...kept },
          hugWidth: placement.hugWidth && box.width === started.width,
          hugHeight: placement.hugHeight && box.height === started.height,
        })
      }
    },
    options.journal,
  )
  const frames = await frameRecords(root, page.project, page.name)
  return frames.filter((frame) => names.includes(frame.name))
}

/**
 * The stored size of each hugging axis a hand write leaves at the size it
 * started from, since the server may have measured that axis since and a move
 * never meant to set it.
 */
function measuredAxes(
  placement: Placement,
  box: Box,
  started: Box,
): Partial<Box> {
  return {
    ...(placement.hugWidth && box.width === started.width
      ? { width: placement.box.width }
      : {}),
    ...(placement.hugHeight && box.height === started.height
      ? { height: placement.box.height }
      : {}),
  }
}

function boxOf({ x, y, width, height }: Box): Box {
  return { x, y, width, height }
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
  change: (placement: Placement, ref: string) => Placement,
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  const page = pageDir(frame)
  await withLayouts(
    [page],
    async (layouts) => {
      const layout = layoutAt(layouts, page)
      layout.set(frame.name, change(layout.placement(frame.name), refOf(frame)))
    },
    options.journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

/** Which axes `frame add` leaves hugging: every one no size option names, the height under a preset. */
/** Which axes a frame placed with these options sizes from its content. */
export function hugsOf({ size, width, height }: SizeOptions): {
  hugWidth: boolean
  hugHeight: boolean
} {
  return {
    hugWidth: size === undefined && width === undefined,
    hugHeight: height === undefined,
  }
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
  if (size !== undefined) return frameSizeOf(size)
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
  // canon-allow-embedded: interpolates the frame title, and the bundled CLI has no substitution step for a file on disk
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
   * Writes the seven fixed keys on the entry it creates or changes, after any
   * key the entry already held, so unknown keys survive in place. A hug flag
   * is written on an entry it creates, once it is on, or when the entry holds
   * it, so a write to an entry from before the flags adds no key. `scroll` is
   * written once it is on or when the entry holds it, and a scroll entry
   * writes both hug flags false, since it fixes both axes. `widths` is
   * written while it lists one and removed once it lists none, and a held
   * value no reader understands is left as it stands.
   */
  set(
    name: string,
    {
      box,
      order,
      hidden,
      locked,
      scroll,
      widths,
      hugWidth: hugsWidth,
      hugHeight: hugsHeight,
    }: Placement,
  ): void {
    const hugWidth = hugsWidth && !scroll
    const hugHeight = hugsHeight && !scroll
    const held = this.file.frames[name]
    const entry: LayoutEntry = {
      ...held,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      order,
      hidden,
      locked,
      ...(!held || hugWidth || held.hugWidth !== undefined ? { hugWidth } : {}),
      ...(!held || hugHeight || held.hugHeight !== undefined
        ? { hugHeight }
        : {}),
      ...(scroll || held?.scroll !== undefined ? { scroll } : {}),
      ...(widths.length > 0
        ? { widths: widths.map(({ width, height }) => ({ width, height })) }
        : {}),
    }
    if (widths.length === 0 && widthsOf(held?.widths).length > 0) {
      delete entry.widths
    }
    this.file.frames[name] = entry
    this.changed = true
  }

  remove(name: string): void {
    delete this.file.frames[name]
    this.changed = true
  }

  sectionNames(): string[] {
    return Object.keys(this.file.sections ?? {})
  }

  section(name: string): SectionEntry | undefined {
    const sections = this.file.sections ?? {}
    return Object.hasOwn(sections, name) ? sections[name] : undefined
  }

  /** Writes the five fixed keys after any the entry already held, so unknown keys survive. */
  setSection(name: string, entry: SectionEntry): void {
    const sections = (this.file.sections ??= {})
    const { x, y, width, height, order } = entry
    sections[name] = { ...sections[name], x, y, width, height, order }
    this.changed = true
  }

  removeSection(name: string): void {
    if (this.file.sections) delete this.file.sections[name]
    this.changed = true
  }

  topSectionOrder(): number {
    return Math.max(
      ...this.sectionNames().map(
        (name) => (this.section(name)?.order ?? 0) + 1,
      ),
      0,
    )
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
  const wasSections = before?.sections ?? {}
  const nowSections = after.sections ?? {}
  for (const section of new Set([
    ...Object.keys(wasSections),
    ...Object.keys(nowSections),
  ])) {
    const from = wasSections[section]
    const to = nowSections[section]
    if (!isDeepStrictEqual(from, to)) journal.section(page, section, from, to)
  }
}

export function layoutAt(
  layouts: Map<string, PageLayout>,
  page: string,
): PageLayout {
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
