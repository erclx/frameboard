import { existsSync } from 'node:fs'
import { constants, copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { FrameboardError } from '@/shared/errors'
import { deviceForWidth } from '@/shared/frame-device'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_SIZES,
  type FrameSizeName,
  frameSizeOf,
  referenceHeight,
} from '@/shared/frame-sizes'
import {
  drawnExtent,
  type LinkedWidth,
  widthsOf,
  xPast,
} from '@/shared/frame-widths'
import { kitOf } from '@/shared/kits'
import { nextFreeName } from '@/shared/names'
import {
  storedTransitionOf,
  type Transition,
} from '@/shared/present-transition'
import {
  type LayoutEntry,
  type LayoutFile,
  type SectionEntry,
  SPEAKER_NOTES_MAX,
  speakerNotesOf,
} from '@/shared/records/board'
import type { FrameRecord } from '@/shared/records/list'

import { reservedBox } from '../claims/store'
import { projectKitNames } from '../kits/project'
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
  placeNext,
  readPageOrder,
  scanPage,
} from './scan'
import { assertKnownTransition } from './transitions'

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

export interface BodyOptions {
  /**
   * Markup the new file's body holds edge to edge, with no margin around it.
   * A file already standing under the name refuses `name-taken`, since its
   * bytes are kept and the markup would be dropped.
   */
  body?: string
}

export interface DeviceOptions {
  /** Whether the board draws the frame inside the device its width names, off when absent. */
  showDevice?: boolean
}

export type FrameFlag = 'hidden' | 'locked'

/**
 * Places a frame, writing a skeleton only when no file exists. Every axis no
 * size names hugs, the box standing in until the server measures, and a scroll
 * frame hugs neither axis.
 */
export async function addFrame(
  root: string,
  ref: string,
  options: RefOptions &
    SizeOptions &
    PositionOptions &
    ScrollOptions &
    WidthsOptions &
    DeviceOptions &
    BodyOptions &
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
      if (exists && options.body !== undefined) {
        throw new FrameboardError(
          'name-taken',
          `${frame.project}/${frame.page}/${frame.name} already has a file, so nothing was written into it.`,
          { ref: refOf(frame) },
        )
      }
      const names = exists ? layout.names : [...layout.names, frame.name].sort()
      // Lands past the placed frames alone, ignoring other unplaced files.
      const placed = placeFrames(
        layout.file.frames,
        names.filter((name) => layout.hasEntry(name)),
      )
      // An entry left by a missing file keeps its box.
      const stale = placed.get(frame.name)
      const width =
        size.width ?? stale?.box.width ?? FRAME_SIZES[DEFAULT_FRAME_SIZE].width
      const computed =
        stale ??
        placeNext([...placed.values()], {
          width,
          device: options.showDevice ? deviceForWidth(width) : null,
        })
      // Refused ahead of the skeleton, so a refusal leaves no file behind.
      const widths = linkedWidths(refOf(frame), options.widths, {
        width,
        hugWidth: hugs.hugWidth,
        held: [],
      })
      if (!exists) {
        await writeFile(frame.path, skeleton(frame.name, options.body), {
          flag: 'wx',
        })
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
        ...(options.showDevice ? { showDevice: true as const } : {}),
      })
      layout.renumber()
    },
    journal,
  )
  return frameRecord(root, frame.project, frame.page, frame.name)
}

/**
 * Copies the frame byte for byte beside its source or into `--to`, an `offset`
 * placing it that far away, as an Alt-drag drops it.
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
 * Fixes the axes the options size. `scroll` drops a hugging height to the
 * width's reference height, since a full-height frame has nothing to scroll.
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
  return updatePlacement(root, ref, options, (placement, frameRef) =>
    resizedPlacement(placement, frameRef, size, options),
  )
}

/** A frame a widths write names, with the list of widths the caller drew it showing. */
export interface WidthsTarget {
  ref: string
  expected: readonly number[]
}

/**
 * Sets each frame's whole width list in one write, refusing `stale-layout`
 * before any write when a stored list moved off its `expected`.
 */
export async function setLinkedWidths(
  root: string,
  targets: readonly WidthsTarget[],
  widths: readonly number[],
  options: RefOptions & JournalOptions,
): Promise<FrameRecord[]> {
  const frames = await Promise.all(
    targets.map(async (target) => ({
      target,
      frame: await resolveFrameRef(root, target.ref, options),
    })),
  )
  await withLayouts(
    frames.map(({ frame }) => pageDir(frame)),
    async (layouts) => {
      const next = frames.map(({ target, frame }) => {
        const layout = layoutAt(layouts, pageDir(frame))
        const placement = layout.placement(frame.name)
        const frameRef = refOf(frame)
        const stored = placement.widths.map((linked) => linked.width)
        if (!isDeepStrictEqual(stored, target.expected)) {
          throw new FrameboardError(
            'stale-layout',
            `${frameRef}'s widths changed since this edit began, so nothing was written.`,
            { ref: frameRef, stored, expected: target.expected },
          )
        }
        return {
          layout,
          name: frame.name,
          placement: resizedPlacement(placement, frameRef, {}, { widths }),
        }
      })
      for (const { layout, name, placement } of next) {
        layout.set(name, placement)
      }
    },
    options.journal,
  )
  return Promise.all(
    frames.map(({ frame }) =>
      frameRecord(root, frame.project, frame.page, frame.name),
    ),
  )
}

/** The placement `resizeFrame` writes, for the size it read off its options. */
function resizedPlacement(
  placement: Placement,
  frameRef: string,
  size: { width?: number; height?: number },
  options: ScrollOptions & WidthsOptions,
): Placement {
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
    // Each linked width takes its own screen height, so every view of a scroll frame scrolls.
    widths:
      scroll && placement.hugHeight
        ? widths.map((linked) => ({
            ...linked,
            height: referenceHeight(linked.width),
          }))
        : widths,
  }
}

/**
 * The linked widths a verb writes, a new one taking its reference height until
 * measured, refusing a repeat, the own width, or a width-hugging frame.
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

/** The x a copy placed beside a frame takes, its own body clear of the frame's device and linked widths. */
export function pastExtent({ box, widths, device }: Placement): number {
  const extent = drawnExtent(box, widths, device)
  return xPast(extent.x + extent.width, box.width, device)
}

/**
 * Sets the measured height and hugs it, the inverse of a fixing resize, and
 * refuses `fit-scroll` on a scroll frame, whose height is fixed on purpose.
 */
export async function fitHeight(
  root: string,
  ref: string,
  height: number,
  options: RefOptions & JournalOptions & { widths?: readonly LinkedWidth[] },
): Promise<FrameRecord> {
  return updatePlacement(root, ref, options, (placement) => {
    if (placement.scroll) throw fitScrollError(ref)
    return fittedPlacement(placement, height, options.widths)
  })
}

/** A placement hugging its measured height, each listed linked width taking its own. */
function fittedPlacement(
  placement: Placement,
  height: number,
  widths: readonly LinkedWidth[] | undefined,
): Placement {
  return {
    ...placement,
    box: { ...placement.box, height },
    hugHeight: true,
    widths: placement.widths.map((linked) => ({
      ...linked,
      height:
        widths?.find((each) => each.width === linked.width)?.height ??
        linked.height,
    })),
  }
}

/** How a frame holds its height: at a size, at its content's, or at a screen the page scrolls past. */
export type HeightMode = 'fixed' | 'fit' | 'scroll'

/** One frame a height mode write names, with the box its caller started from. */
export interface HeightTarget {
  ref: string
  expected: Box
  /** The content height `fit` takes, with each linked width's own. */
  measured?: { height: number; widths?: readonly LinkedWidth[] }
  /** The screen height `scroll` takes, over the drop a hugging height takes without it. */
  height?: number
}

/**
 * Sets each frame's height mode in one write, all or none. Every frame is
 * checked first against its `expected`, leaving out a hugged axis, since the
 * server measures that one.
 */
export async function setHeightModes(
  root: string,
  targets: readonly HeightTarget[],
  mode: HeightMode,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord[]> {
  const frames = await Promise.all(
    targets.map(async (target) => ({
      target,
      frame: await resolveFrameRef(root, target.ref, options),
    })),
  )
  await withLayouts(
    frames.map(({ frame }) => pageDir(frame)),
    async (layouts) => {
      const next = frames.map(({ target, frame }) => {
        const layout = layoutAt(layouts, pageDir(frame))
        const placement = layout.placement(frame.name)
        const frameRef = refOf(frame)
        refuseStale(frameRef, placement, target.expected)
        return {
          layout,
          name: frame.name,
          placement: heightPlacement(placement, frameRef, mode, target),
        }
      })
      for (const { layout, name, placement } of next) {
        layout.set(name, placement)
      }
    },
    options.journal,
  )
  return Promise.all(
    frames.map(({ frame }) =>
      frameRecord(root, frame.project, frame.page, frame.name),
    ),
  )
}

function heightPlacement(
  placement: Placement,
  frameRef: string,
  mode: HeightMode,
  { measured, height }: HeightTarget,
): Placement {
  if (mode === 'scroll') {
    const size = height === undefined ? {} : { height }
    return resizedPlacement(placement, frameRef, size, { scroll: true })
  }
  if (mode === 'fixed') {
    return { ...placement, hugHeight: false, scroll: false }
  }
  if (!measured) {
    throw new FrameboardError(
      'usage',
      `Fitting ${frameRef} needs its measured height.`,
      { ref: frameRef },
    )
  }
  return {
    ...fittedPlacement(placement, measured.height, measured.widths),
    scroll: false,
  }
}

function refuseStale(ref: string, placement: Placement, expected: Box): void {
  const { box } = placement
  const same =
    box.x === expected.x &&
    box.y === expected.y &&
    (placement.hugWidth || box.width === expected.width) &&
    (placement.hugHeight || box.height === expected.height)
  if (!same) {
    throw new FrameboardError(
      'stale-layout',
      `${ref} moved since this edit began, so nothing was written.`,
      { ref, stored: boxOf(box), expected },
    )
  }
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
 * Writes measured sizes on hugged axes alone, with no flag and no journal,
 * since the developer never set them.
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
      // Only while the entry still lists the width and hugs its height.
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
 * Sets frame boxes in one write, the hand path. A box moved off its `expected`
 * refuses the whole write, so a hand edit never silently undoes an agent's.
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
          // A resize onto a listed width drops it, so the list never names the own width.
          widths: placement.widths.filter(
            (linked) => linked.width !== (kept.width ?? box.width),
          ),
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

/**
 * Shows or hides the device the board draws around a frame, which the
 * frame's width picks. The frame's file and box are left as they stand,
 * since the body wraps whatever size the frame is.
 */
export async function setFrameDevice(
  root: string,
  ref: string,
  show: boolean,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord> {
  return updatePlacement(root, ref, options, (placement) => {
    const { showDevice: _held, device: _device, ...rest } = placement
    return show ? { ...rest, showDevice: true } : rest
  })
}

/**
 * Sets or clears a frame's present transition, refusing a name neither built
 * in nor the project's own.
 */
export async function setFrameTransition(
  root: string,
  ref: string,
  transition: Transition | null,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  await assertKnownTransition(join(root, frame.project), transition)
  return updatePlacement(root, ref, options, (placement) => {
    const { transition: _held, ...rest } = placement
    return transition ? { ...rest, transition } : rest
  })
}

/**
 * Sets the project kit a frame draws with, or clears it with null, writing
 * only its layout entry. Refuses `kit-not-found` for a name the frame's
 * project holds no kit under, and stores the folder's own spelling.
 */
export async function setFrameKit(
  root: string,
  ref: string,
  kit: string | null,
  options: RefOptions & JournalOptions,
): Promise<FrameRecord> {
  const frame = await resolveFrameRef(root, ref, options)
  const held = kit === null ? null : await heldKit(root, frame.project, kit)
  return updatePlacement(root, ref, options, (placement) => {
    const { kit: _held, ...rest } = placement
    return held ? { ...rest, kit: held } : rest
  })
}

/** The project's kit `name` answers to, refusing `kit-not-found` with the kits it holds. */
async function heldKit(
  root: string,
  project: string,
  name: string,
): Promise<string> {
  const known = await projectKitNames(join(root, project))
  const found = matchName(known, name)
  if (found) return found
  throw new FrameboardError(
    'kit-not-found',
    `${project} holds no kit named ${name}. Add one with \`frameboard kit add ${project} <kit>\`.`,
    { kit: name, project, known },
  )
}

/**
 * Sets a frame's speaker note on its layout entry, null or blank clearing it.
 * Refuses `usage` past `SPEAKER_NOTES_MAX` rather than cutting, and
 * `stale-layout` once `expected`, the note the edit began from, is gone.
 */
export async function setFrameSpeakerNotes(
  root: string,
  ref: string,
  text: string | null,
  { expected, ...options }: RefOptions & JournalOptions & { expected?: string },
): Promise<FrameRecord> {
  if (text !== null && text.length > SPEAKER_NOTES_MAX) {
    throw new FrameboardError(
      'usage',
      `A speaker note holds at most ${SPEAKER_NOTES_MAX} characters, and this one has ${text.length}.`,
      { max: SPEAKER_NOTES_MAX, length: text.length },
    )
  }
  const speakerNotes = speakerNotesOf(text)
  return updatePlacement(root, ref, options, (placement, frameRef) => {
    const { speakerNotes: held, ...rest } = placement
    if (
      expected !== undefined &&
      (speakerNotesOf(expected) ?? '') !== (held ?? '')
    ) {
      throw new FrameboardError(
        'stale-layout',
        `The speaker notes on ${frameRef} changed since this edit began, so nothing was written.`,
        { ref: frameRef, stored: held ?? '', expected },
      )
    }
    return speakerNotes ? { ...rest, speakerNotes } : rest
  })
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
 * every address holds, and a body column has no margin, so media fits exactly.
 */
export function skeleton(name: string, body?: string): string {
  const content =
    body === undefined
      ? '<body></body>'
      : `<body style="margin: 0; display: flex; flex-direction: column; align-items: flex-start">${body}</body>`
  // canon-allow-embedded: interpolates the frame title, and the bundled CLI has no substitution step for a file on disk
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
  </head>
  ${content}
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
   * Writes the fixed keys after the entry's own, so unknown keys survive, and a
   * flag only once on or already held, so an older entry gains no key.
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
      showDevice,
      transition,
      speakerNotes,
      kit,
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
      ...(showDevice ? { showDevice } : {}),
      ...(transition ? { transition: { ...transition } } : {}),
      ...(speakerNotes ? { speakerNotes } : {}),
      ...(kit ? { kit } : {}),
    }
    if (widths.length === 0 && widthsOf(held?.widths).length > 0) {
      delete entry.widths
    }
    if (!showDevice && held?.showDevice === true) delete entry.showDevice
    if (typeof held?.device === 'string') delete entry.device
    if (!transition && storedTransitionOf(held?.transition)) {
      delete entry.transition
    }
    if (!speakerNotes && speakerNotesOf(held?.speakerNotes)) {
      delete entry.speakerNotes
    }
    if (!kit && kitOf(held?.kit)) delete entry.kit
    this.file.frames[name] = entry
    this.changed = true
  }

  /**
   * Sets the page's transition on the `present` key, or clears it with null,
   * keeping any other key `present` holds and dropping `present` once empty.
   */
  setTransition(transition: Transition | null): void {
    const held = this.file.present
    const present: Record<string, unknown> =
      typeof held === 'object' && held !== null && !Array.isArray(held)
        ? { ...held }
        : {}
    if (transition) present.transition = { ...transition }
    else delete present.transition
    if (Object.keys(present).length > 0) this.file.present = present
    else delete this.file.present
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
 * Runs one frame change under every touched page's lock in path order,
 * validating every layout before `run` moves a file.
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
  if (!isDeepStrictEqual(before?.present, after.present)) {
    journal.present(page, before?.present, after.present)
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
