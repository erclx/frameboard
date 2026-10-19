import { createHash } from 'node:crypto'
import { readdir, readFile, rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { Journal } from '@/server/board/journal'
import {
  isCode,
  LOCK_SUFFIX,
  readRecord,
  TEMP_SUFFIX,
  writeRecord,
} from '@/server/board/json-record'
import {
  emptyProject,
  LAYOUT_FILE,
  layoutSpec,
  PROJECT_FILE,
  projectSpec,
} from '@/server/board/scan'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { LayoutEntry } from '@/shared/records/board'

import { takeOut, trashSlot } from './trash'

/** Which state of a change: as it stood before the step, or as the step left it. */
export type Side = 'before' | 'after'

/**
 * One small thing a step changed, held as its two states. Each is fine
 * enough that an agent's write elsewhere in the same file or folder neither
 * blocks an undo nor is reverted by it.
 */
export type Change =
  /** One frame's entry in one `layout.json`, undefined when it has none. */
  | {
      kind: 'entry'
      layout: string
      frame: string
      before: LayoutEntry | undefined
      after: LayoutEntry | undefined
    }
  /** The page order one `project.json` holds. */
  | { kind: 'pages'; file: string; before: string[]; after: string[] }
  /** A file or folder renamed from `from` to `to`. */
  | { kind: 'moved'; from: string; to: string }
  /**
   * A file or folder present on one side only, with the content hash it had
   * there, and the trash slot it waits in on the other.
   */
  | { kind: 'path'; path: string; present: Side; hash: string; slot: string }

/** The records a change writes, whose locks are held while it is checked and written. */
export function lockPaths(change: Change): string[] {
  if (change.kind === 'entry') return [change.layout]
  if (change.kind === 'pages') return [change.file]
  return []
}

/**
 * Whether the board still stands as `side` of the change left it, read
 * under the record's lock. A change that no longer holds was overtaken, and
 * so was one whose record an agent left unreadable, since writing it back
 * would overwrite that file and keeping the step would block every older one.
 */
export async function holds(change: Change, side: Side): Promise<boolean> {
  try {
    return await reads(change, side)
  } catch (error) {
    if (error instanceof FrameboardError && UNREADABLE.has(error.code)) {
      return false
    }
    throw error
  }
}

const UNREADABLE = new Set<ErrorCode>([
  'layout-invalid',
  'project-file-invalid',
])

async function reads(change: Change, side: Side): Promise<boolean> {
  switch (change.kind) {
    case 'entry': {
      const file = await readRecord(change.layout, layoutSpec)
      return isDeepStrictEqual(file.frames[change.frame], change[side])
    }
    case 'pages': {
      const file = await readRecord(change.file, {
        ...projectSpec,
        empty: emptyProject,
      })
      return isDeepStrictEqual(file.pages, change[side])
    }
    case 'moved': {
      const [present, absent] =
        side === 'after' ? [change.to, change.from] : [change.from, change.to]
      return (await exists(present)) && !(await exists(absent))
    }
    case 'path':
      return change.present === side
        ? (await exists(change.path)) &&
            (await hashPath(change.path)) === change.hash
        : !(await exists(change.path)) && (await exists(change.slot))
  }
}

/** Writes `side` of a change back, under the record's lock, once `holds` read the other side. */
export async function restore(change: Change, side: Side): Promise<void> {
  switch (change.kind) {
    case 'entry': {
      const file = await readRecord(change.layout, layoutSpec)
      const frames = { ...file.frames }
      const entry = change[side]
      if (entry) frames[change.frame] = entry
      else delete frames[change.frame]
      await writeRecord(change.layout, { ...file, frames })
      return
    }
    case 'pages': {
      const file = await readRecord(change.file, {
        ...projectSpec,
        empty: emptyProject,
      })
      await writeRecord(change.file, { ...file, pages: change[side] })
      return
    }
    case 'moved':
      if (side === 'before') await rename(change.to, change.from)
      else await rename(change.from, change.to)
      return
    case 'path':
      if (change.present === side) await rename(change.slot, change.path)
      else await takeOut(change.path, change.slot)
  }
}

/**
 * The journal one board write reports into, building the changes of one
 * step. A path it takes out waits in the step's trash folder.
 */
export class StepJournal implements Journal {
  readonly changes: Change[] = []

  constructor(
    readonly root: string,
    readonly id: number,
  ) {}

  entry(
    page: string,
    frame: string,
    before: LayoutEntry | undefined,
    after: LayoutEntry | undefined,
  ): void {
    const layout = join(page, LAYOUT_FILE)
    this.changes.push({ kind: 'entry', layout, frame, before, after })
  }

  pages(project: string, before: string[], after: string[]): void {
    const file = join(project, PROJECT_FILE)
    this.changes.push({ kind: 'pages', file, before, after })
  }

  async moved(from: string, to: string): Promise<void> {
    await rename(from, to)
    this.changes.push({ kind: 'moved', from, to })
  }

  async created(path: string): Promise<void> {
    this.changes.push({
      kind: 'path',
      path,
      present: 'after',
      hash: await hashPath(path),
      slot: this.#slot(),
    })
  }

  async removed(path: string): Promise<void> {
    const hash = await hashPath(path)
    const slot = this.#slot()
    await takeOut(path, slot)
    this.changes.push({ kind: 'path', path, present: 'before', hash, slot })
  }

  #slot(): string {
    return trashSlot(this.root, this.id, this.changes.length)
  }
}

/**
 * A hash over a file's bytes, or over every file in a folder with its path.
 * Dot-named entries, locks, and temp files are left out, as the scanner
 * leaves them, so a lock taken and released reads as no change.
 */
export async function hashPath(path: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (at: string, name: string): Promise<void> => {
    if ((await stat(at)).isDirectory()) {
      hash.update(`d:${name}\0`)
      const children = (await readdir(at)).filter(isHashed).sort()
      for (const child of children)
        await walk(join(at, child), `${name}/${child}`)
    } else {
      hash.update(`f:${name}\0`)
      hash.update(await readFile(at))
      hash.update('\0')
    }
  }
  await walk(path, '.')
  return hash.digest('hex')
}

function isHashed(name: string): boolean {
  return (
    !name.startsWith('.') &&
    !name.endsWith(LOCK_SUFFIX) &&
    !name.endsWith(TEMP_SUFFIX)
  )
}

/**
 * Whether the path exists under exactly this name, read from its folder's
 * listing, so a case-only rename on a case-insensitive volume tells the two
 * names apart.
 */
async function exists(path: string): Promise<boolean> {
  try {
    return (await readdir(dirname(path))).includes(basename(path))
  } catch (error) {
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
}
