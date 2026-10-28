import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import {
  ASSETS_FOLDER,
  BOARD_FILE,
  FRAME_EXTENSION,
  PROJECT_FILE,
} from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_GAP,
  FRAME_SIZES,
} from '@/shared/frame-sizes'
import {
  type LayoutEntry,
  type LayoutFile,
  layoutFileSchema,
  type ProjectFile,
  projectFileSchema,
  type SectionEntry,
} from '@/shared/records/board'
import type {
  FrameRecord,
  ListResult,
  PageRecord,
  ProjectRecord,
  SectionRecord,
} from '@/shared/records/list'
import { membersOf } from '@/shared/sections'

import { isCode, readRecord, type RecordSpec } from './json-record'

export const LAYOUT_FILE = 'layout.json'
export { ASSETS_FOLDER, BOARD_FILE, FRAME_EXTENSION, PROJECT_FILE }

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
 * The page order a reader shows: listed pages that exist in that order, then
 * unlisted ones by name. A file that fails to read orders every page by name.
 * The creation time comes from the same read, null when the file holds none.
 */
export async function readPageOrder(projectDir: string): Promise<{
  pages: string[]
  createdAt: string | null
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
      error: { path, message: error.message },
    }
  }
  return {
    pages: orderPages(file.pages, folders),
    createdAt: isTime(file.createdAt) ? file.createdAt : null,
    error: null,
  }
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
 * Every frame's placement, placed ones from their entry and unplaced ones by
 * `placeNext`. Entries with no frame file beside them are left out.
 */
export function placeFrames(
  frames: Record<string, LayoutEntry>,
  names: string[],
): Map<string, Placement> {
  const placements = new Map<string, Placement>()
  const unplaced: string[] = []
  for (const name of names) {
    const entry = Object.hasOwn(frames, name) ? frames[name] : undefined
    if (!entry) {
      unplaced.push(name)
      continue
    }
    placements.set(name, {
      box: { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
      order: entry.order,
      hidden: entry.hidden ?? false,
      locked: entry.locked ?? false,
      hugWidth: entry.hugWidth ?? false,
      hugHeight: entry.hugHeight ?? false,
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

/**
 * Where a frame with no layout entry sits: desktop size at `y` 0, 80 past the
 * right edge of every frame already placed, on top of all of them. The board
 * draws what the scanner returns, and `frame add` persists the same box for
 * the first unplaced file, placing any other past the placed frames alone.
 */
export function placeNext(placed: Placement[]): Placement {
  const right = Math.max(
    ...placed.map(({ box }) => box.x + box.width + FRAME_GAP),
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
  const { pages: order, createdAt, error } = await readPageOrder(path)
  const pages = await Promise.all(
    order.map((page, index) => scanPage(root, name, page, index)),
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
    path,
    modifiedAt: new Date(Math.max(...times)).toISOString(),
    createdAt,
    projectFileError: error,
    pages,
  }
}

export async function scanPage(
  root: string,
  project: string,
  name: string,
  index: number,
): Promise<PageRecord> {
  const path = join(root, project, name)
  const layoutPath = join(path, LAYOUT_FILE)
  let frames: Record<string, LayoutEntry> = {}
  let sections: Record<string, SectionEntry> = {}
  let layoutError: PageRecord['layoutError'] = null
  try {
    const file = await readRecord(layoutPath, layoutSpec)
    frames = file.frames
    sections = file.sections ?? {}
  } catch (error) {
    if (!(error instanceof FrameboardError)) throw error
    layoutError = { path: layoutPath, message: error.message }
  }

  const names = await listFrames(path)
  const placements = placeFrames(frames, names)
  const records = await Promise.all(
    names.map(async (frame): Promise<FrameRecord> => {
      const framePath = join(path, `${frame}${FRAME_EXTENSION}`)
      const placement = placements.get(frame) ?? placeNext([])
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
    frames: stacked,
    sections: sectionRecords(sections, stacked),
  }
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
