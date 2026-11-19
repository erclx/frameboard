import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import {
  ASSETS_FOLDER,
  BOARD_FILE,
  FRAME_EXTENSION,
  LAYOUT_FILE,
  PROJECT_FILE,
} from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  type Device,
  deviceForWidth,
  islandOf,
  type Pose,
  poseOf,
  turnOf,
  uprightOf,
  type UprightSize,
  uprightWidth,
} from '@/shared/frame-device'
import { DEFAULT_FRAME_SIZE, FRAME_SIZES } from '@/shared/frame-sizes'
import {
  drawnExtent,
  drawnWidths,
  type LinkedWidth,
  widthsOf,
  xPast,
} from '@/shared/frame-widths'
import { kitOf } from '@/shared/kits'
import {
  storedTransitionOf,
  type Transition,
  transitionOf,
} from '@/shared/present-transition'
import {
  type LayoutEntry,
  type LayoutFile,
  layoutFileSchema,
  type ProjectFile,
  projectFileSchema,
  type SectionEntry,
  speakerNotesOf,
} from '@/shared/records/board'
import type {
  FrameRecord,
  ListResult,
  PageRecord,
  ProjectRecord,
  SectionRecord,
} from '@/shared/records/list'
import { membersOf } from '@/shared/sections'

import { projectKits } from '../kits/project'
import { isCode, readRecord, type RecordSpec } from './json-record'
import { listTransitionNames } from './transitions'

export { ASSETS_FOLDER, BOARD_FILE, FRAME_EXTENSION, LAYOUT_FILE, PROJECT_FILE }

export const layoutSpec: RecordSpec<LayoutFile> = {
  schema: layoutFileSchema,
  invalidCode: 'layout-invalid',
  empty: () => ({ version: 1, frames: {} }),
}

export const projectSpec: RecordSpec<ProjectFile> = {
  schema: projectFileSchema,
  invalidCode: 'project-file-invalid',
}

export type Box = FrameRecord['box']

/** A layout entry as read, with absent flags taken as false. */
export interface Placement {
  box: Box
  order: number
  hidden: boolean
  locked: boolean
  hugWidth: boolean
  hugHeight: boolean
  scroll: boolean
  widths: LinkedWidth[]
  /** Present while the board draws the frame inside a device. */
  showDevice?: true
  /** The device drawn while one shows, the foldable when named, else the width's, absent under 320 wide. */
  device?: Device
  /** Present while the frame names the foldable, shown or not, with its pose. */
  foldable?: true
  pose?: Pose
  /** Present while the frame picks the phone's wide island, shown or not. */
  island?: 'wide'
  /** Present while the frame is turned, with the size it held upright, which only the write reads. */
  turn?: 'left' | 'right'
  upright?: UprightSize
  /** The widths a foldable's entry lists and never draws, which un-naming it draws again. */
  keptWidths?: LinkedWidth[]
  /** Absent for a frame with no override or one holding a value no reader knows. */
  transition?: Transition
  /** Absent for a frame with no note or one holding a value of another type. */
  speakerNotes?: string
  /** Absent for a frame naming no kit, and present for a named kit the project lacks. */
  kit?: string
  placed: boolean
}

/** Projects in the root by name, skipping dot-named folders. */
export async function listProjects(root: string): Promise<string[]> {
  return (await childFolders(root)).sort(byName)
}

/** Pages in a project folder, skipping `assets` and dot-named folders, by name. */
export async function listPageFolders(projectDir: string): Promise<string[]> {
  return (await childFolders(projectDir))
    .filter((name) => name !== ASSETS_FOLDER)
    .sort(byName)
}

/** Frame names in a page folder, being the stems of its `*.html` files, by name. */
export async function listFrames(pageDir: string): Promise<string[]> {
  const entries = await readdir(pageDir, { withFileTypes: true })
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(FRAME_EXTENSION) &&
        !entry.name.startsWith('.'),
    )
    .map((entry) => entry.name.slice(0, -FRAME_EXTENSION.length))
    .sort(byName)
}

/**
 * The page order, listed pages first, then unlisted by name, all by name for
 * an unreadable file, each other key absent when of another type.
 */
export async function readPageOrder(projectDir: string): Promise<{
  pages: string[]
  createdAt: string | null
  title: string | null
  group: string | null
  archived: boolean
  checksOff: string[]
  error: { path: string; message: string } | null
}> {
  const folders = await listPageFolders(projectDir)
  const path = join(projectDir, PROJECT_FILE)
  let file: ProjectFile
  try {
    file = await readRecord(path, { ...projectSpec, empty: emptyProject })
  } catch (error) {
    if (!(error instanceof FrameboardError)) throw error
    return {
      pages: folders,
      createdAt: null,
      title: null,
      group: null,
      archived: false,
      checksOff: [],
      error: { path, message: error.message },
    }
  }
  return {
    pages: orderPages(file.pages, folders),
    createdAt: isTime(file.createdAt) ? file.createdAt : null,
    title: titleOf(file.title),
    group: groupOf(file.group),
    archived: file.archived === true,
    checksOff: checksOffOf(file.checks),
    error: null,
  }
}

/**
 * The rule ids a `checks` value turns off, each once, for display alone: an
 * `off` that is not a list of strings reads as none, as the checks read it.
 */
export function checksOffOf(checks: unknown): string[] {
  if (typeof checks !== 'object' || checks === null || !('off' in checks)) {
    return []
  }
  const { off } = checks
  if (!Array.isArray(off) || !off.every((each) => typeof each === 'string')) {
    return []
  }
  return [...new Set(off)]
}

/** A folder name as home shows it, trimmed, null for a blank or a non-string. */
export function groupOf(value: unknown): string | null {
  return trimmedOf(value)
}

/** A project's title as readers show it, trimmed, null for a blank or a non-string. */
export function titleOf(value: unknown): string | null {
  return trimmedOf(value)
}

function trimmedOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isTime(value: unknown): value is string {
  return z.iso.datetime().safeParse(value).success
}

export function orderPages(listed: string[], folders: string[]): string[] {
  const present = new Set(folders)
  const ordered = [...new Set(listed)].filter((name) => present.has(name))
  const seen = new Set(ordered)
  return [...ordered, ...folders.filter((name) => !seen.has(name))]
}

export function emptyProject(): ProjectFile {
  return { version: 1, pages: [] }
}

/**
 * Every frame's placement, unplaced ones by `placeNext`, leaving out entries
 * with no frame file.
 */
export function placeFrames(
  frames: Record<string, LayoutEntry>,
  names: string[],
  readTransition: (value: unknown) => Transition | null = storedTransitionOf,
): Map<string, Placement> {
  const placements = new Map<string, Placement>()
  const unplaced: string[] = []
  for (const name of names) {
    const entry = Object.hasOwn(frames, name) ? frames[name] : undefined
    if (!entry) {
      unplaced.push(name)
      continue
    }
    // A scroll frame reads hug flags as off, so the hug step never measures it.
    const scroll = entry.scroll ?? false
    const box = {
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
    }
    const shown = showsDevice(entry)
    const foldable = entry.foldable === true
    const kept = widthsOf(entry.widths)
    const upright = uprightOf(entry.upright)
    // A foldable's poses are its sizes, so it reads upright whatever it holds.
    const turn = upright && !foldable ? turnOf(entry.turn) : 'upright'
    const named = foldable ? 'foldable' : deviceForWidth(uprightWidth(entry))
    const device = shown ? named : null
    const transition = readTransition(entry.transition)
    const speakerNotes = speakerNotesOf(entry.speakerNotes)
    const kit = kitOf(entry.kit)
    placements.set(name, {
      box,
      order: entry.order,
      hidden: entry.hidden ?? false,
      locked: entry.locked ?? false,
      hugWidth: !scroll && (entry.hugWidth ?? false),
      hugHeight: !scroll && (entry.hugHeight ?? false),
      scroll,
      widths: drawnWidths(entry),
      ...(shown ? { showDevice: true as const } : {}),
      ...(device ? { device } : {}),
      ...(foldable ? { foldable, pose: poseOf(entry.pose) } : {}),
      ...(foldable && kept.length > 0 ? { keptWidths: kept } : {}),
      ...(islandOf(entry.island) === 'wide' ? { island: 'wide' as const } : {}),
      ...(turn !== 'upright' && upright ? { turn, upright } : {}),
      ...(transition ? { transition } : {}),
      ...(speakerNotes ? { speakerNotes } : {}),
      ...(kit ? { kit } : {}),
      placed: true,
    })
  }

  const boxes = [...placements.values()]
  for (const name of unplaced) {
    const next = placeNext(boxes)
    boxes.push(next)
    placements.set(name, next)
  }
  return placements
}

/** Whether an entry shows its device, through its own key or the device name written before it. */
export function showsDevice(entry: LayoutEntry | undefined): boolean {
  return entry?.showDevice === true || typeof entry?.device === 'string'
}

/**
 * Where an unplaced frame sits, desktop size with its body 80 past the right
 * edge of every placed frame and its linked widths, the box `frame add`
 * persists. The body is the one the frame will draw, none for a bare file.
 */
export function placeNext(
  placed: Placement[],
  body: { width: number; device: Device | null } = {
    width: FRAME_SIZES[DEFAULT_FRAME_SIZE].width,
    device: null,
  },
): Placement {
  const right = Math.max(
    ...placed.map(({ box, widths, device }) => {
      const extent = drawnExtent(box, widths, device)
      return xPast(extent.x + extent.width, body.width, body.device)
    }),
    0,
  )
  const order = Math.max(...placed.map((placement) => placement.order + 1), 0)
  return {
    box: { x: right, y: 0, ...FRAME_SIZES[DEFAULT_FRAME_SIZE] },
    order,
    hidden: false,
    locked: false,
    hugWidth: false,
    hugHeight: false,
    scroll: false,
    widths: [],
    placed: false,
  }
}

/** Readers sort by order, then name, so a gap or a tie from a hand edit still reads. */
export function byStacking(
  a: { name: string; order: number },
  b: { name: string; order: number },
): number {
  return a.order - b.order || byName(a.name, b.name)
}

export async function scanBoard(
  root: string,
  { project }: { project?: string } = {},
): Promise<ListResult> {
  const names = project ? [project] : await listProjects(root)
  return {
    root,
    projects: await Promise.all(names.map((name) => scanProject(root, name))),
  }
}

export async function scanProject(
  root: string,
  name: string,
): Promise<ProjectRecord> {
  const path = join(root, name)
  const {
    pages: order,
    createdAt,
    title,
    group,
    archived,
    checksOff,
    error,
  } = await readPageOrder(path)
  const transitions = await listTransitionNames(path)
  const pages = await Promise.all(
    order.map((page, index) => scanPage(root, name, page, index, transitions)),
  )
  const times = await Promise.all([
    mtimeOf(join(path, PROJECT_FILE)),
    mtimeOf(path),
    ...pages.flatMap((page) => [
      mtimeOf(join(page.path, LAYOUT_FILE)),
      ...page.frames.map((frame) => Date.parse(frame.modifiedAt)),
    ]),
  ])
  return {
    name,
    title,
    path,
    modifiedAt: new Date(Math.max(...times)).toISOString(),
    createdAt,
    group,
    archived,
    projectFileError: error,
    transitions,
    checksOff,
    kits: await projectKits(path, pages),
    pages,
  }
}

/**
 * One page's record. `transitions` is the project's own transition names,
 * read from its assets when a caller scanning one page passes none.
 */
export async function scanPage(
  root: string,
  project: string,
  name: string,
  index: number,
  transitions?: readonly string[],
): Promise<PageRecord> {
  const path = join(root, project, name)
  const own = transitions ?? (await listTransitionNames(join(root, project)))
  const layoutPath = join(path, LAYOUT_FILE)
  let frames: Record<string, LayoutEntry> = {}
  let sections: Record<string, SectionEntry> = {}
  let layoutError: PageRecord['layoutError'] = null
  let transition: Transition | null = null
  try {
    const file = await readRecord(layoutPath, layoutSpec)
    frames = file.frames
    sections = file.sections ?? {}
    transition = pageTransitionOf(file, own)
  } catch (error) {
    if (!(error instanceof FrameboardError)) throw error
    layoutError = { path: layoutPath, message: error.message }
  }

  const names = await listFrames(path)
  const placements = placeFrames(frames, names, (value) =>
    transitionOf(value, own),
  )
  const records = await Promise.all(
    names.map(async (frame): Promise<FrameRecord> => {
      const framePath = join(path, `${frame}${FRAME_EXTENSION}`)
      // The record carries the pose alone, which only a named foldable holds,
      // and the turn without the upright size the write keeps to restore.
      const {
        foldable: _named,
        keptWidths: _kept,
        upright: _upright,
        ...placement
      } = placements.get(frame) ?? placeNext([])
      return {
        ref: `${project}/${name}/${frame}`,
        project,
        page: name,
        name: frame,
        path: framePath,
        ...placement,
        modifiedAt: new Date(await mtimeOf(framePath)).toISOString(),
      }
    }),
  )

  const stacked = records.sort(byStacking)
  return {
    ref: `${project}/${name}`,
    project,
    name,
    path,
    index,
    layoutError,
    ...(transition ? { transition } : {}),
    frames: stacked,
    sections: sectionRecords(sections, stacked),
  }
}

/**
 * The transition a layout's `present` key holds, null for none, one no
 * reader knows, or one of the project's own that `own` does not list.
 */
export function pageTransitionOf(
  file: LayoutFile,
  own: readonly string[] = [],
): Transition | null {
  const present = file.present
  if (typeof present !== 'object' || present === null) return null
  return transitionOf((present as { transition?: unknown }).transition, own)
}

/** The page's sections bottom first, each naming its members in stacking order. */
export function sectionRecords(
  entries: Readonly<Record<string, SectionEntry>>,
  frames: readonly FrameRecord[],
): SectionRecord[] {
  const sections = Object.entries(entries).map(
    ([name, { x, y, width, height, order }]) => ({
      name,
      box: { x, y, width, height },
      order,
    }),
  )
  const members = membersOf(sections, frames)
  return sections.sort(byStacking).map((section) => ({
    ...section,
    frames: frames
      .filter((frame) => members.get(frame.name) === section.name)
      .map((frame) => frame.name),
  }))
}

async function childFolders(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

async function mtimeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch (error) {
    if (isCode(error, 'ENOENT')) return 0
    throw error
  }
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
