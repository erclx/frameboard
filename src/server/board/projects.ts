import type { Stats } from 'node:fs'
import { cp, mkdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import { nextFreeName } from '@/shared/names'
import type { ProjectFile } from '@/shared/records/board'
import type { ProjectRecord } from '@/shared/records/list'

import type { JournalOptions, ProjectFiling } from './journal'
import { readRecord, withLocks, writeRecord } from './json-record'
import { isCopied } from './pages'
import { assertValidName, matchName, resolveProject } from './refs'
import { START_PAGE } from './root'
import {
  emptyProject,
  listProjects,
  PROJECT_FILE,
  projectSpec,
  scanProject,
} from './scan'

/** A new project holding one empty page. */
export async function addProject(
  root: string,
  name: string,
  now: Date = new Date(),
  { journal }: JournalOptions = {},
): Promise<ProjectRecord> {
  assertValidName('project', name)
  await assertFree(root, name)
  await mkdir(join(root, name, START_PAGE), { recursive: true })
  await writeRecord(join(root, name, PROJECT_FILE), {
    version: 1,
    pages: [START_PAGE],
    createdAt: now.toISOString(),
  })
  await journal?.created(join(root, name))
  return scanProject(root, name)
}

export async function renameProject(
  root: string,
  name: string,
  newName: string,
  { journal }: JournalOptions = {},
): Promise<ProjectRecord> {
  const project = await resolveProject(root, name)
  assertValidName('project', newName)
  await assertFree(root, newName, project.name)
  const renamed = join(root, newName)
  if (journal) await journal.moved(project.path, renamed)
  else await rename(project.path, renamed)
  return scanProject(root, newName)
}

/**
 * A copy of the project under the next free name, without its notes, and
 * stamped as made `now`.
 */
export async function duplicateProject(
  root: string,
  name: string,
  now: Date = new Date(),
  { journal }: JournalOptions = {},
): Promise<ProjectRecord> {
  const source = await resolveProject(root, name)
  const file = await readRecord(join(source.path, PROJECT_FILE), {
    ...projectSpec,
    empty: emptyProject,
  })
  const copy = nextFreeName(source.name, await listProjects(root))
  const copyPath = join(root, copy)
  await cp(source.path, copyPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) => isCopied(basename(path)),
  })
  const { archived: _archived, ...kept } = file
  await writeRecord(join(copyPath, PROJECT_FILE), {
    ...kept,
    createdAt: now.toISOString(),
  })
  await journal?.created(copyPath)
  return scanProject(root, copy)
}

export async function deleteProject(
  root: string,
  name: string,
  { journal }: JournalOptions = {},
): Promise<{ deleted: string }> {
  const project = await resolveProject(root, name)
  if (journal) await journal.removed(project.path)
  else await rm(project.path, { recursive: true, force: true })
  return { deleted: project.name }
}

/** What one filing sets: a folder, `null` taking the project out of one, or the archive flag. */
export type Filing = { group: string | null } | { archived: boolean }

/**
 * Files every named project at once, each `project.json` read and merged
 * under its lock so pages, checks, and unknown keys stay as written. A file
 * that does not parse refuses the whole filing before any is written. The
 * file's and folder's times are put back, since a filing is not an edit to
 * the project and must not move it in home's Edited sort.
 */
export async function fileProjects(
  root: string,
  names: string[],
  filing: Filing,
  { journal }: JournalOptions = {},
): Promise<ProjectRecord[]> {
  const projects = await Promise.all(
    names.map((name) => resolveProject(root, name)),
  )
  const paths = [
    ...new Set(projects.map((project) => join(project.path, PROJECT_FILE))),
  ]
  await keepingTimes(paths, (keep) =>
    withLocks(paths, async () => {
      const files = await Promise.all(
        paths.map((path) =>
          readRecord(path, { ...projectSpec, empty: emptyProject }),
        ),
      )
      for (const [index, path] of paths.entries()) {
        const file = files[index]
        if (!file) continue
        const next = filed(file, filing)
        const before = filingOf(file)
        const after = filingOf(next)
        if (isSameFiling(before, after)) continue
        await keep(path)
        await writeRecord(path, next)
        journal?.project(path, before, after)
      }
    }),
  )
  return Promise.all(projects.map((project) => scanProject(root, project.name)))
}

function filed(file: ProjectFile, filing: Filing): ProjectFile {
  const { group, archived, ...rest } = file
  if ('group' in filing) {
    const name = filing.group?.trim()
    return {
      ...rest,
      ...(name ? { group: name } : {}),
      ...(archived === undefined ? {} : { archived }),
    }
  }
  return {
    ...rest,
    ...(group === undefined ? {} : { group }),
    ...(filing.archived ? { archived: true } : {}),
  }
}

/** The filing keys a project file holds, leaving out the ones it lacks. */
export function filingOf(file: ProjectFiling): ProjectFiling {
  return {
    ...(file.group === undefined ? {} : { group: file.group }),
    ...(file.archived === undefined ? {} : { archived: file.archived }),
  }
}

function isSameFiling(a: ProjectFiling, b: ProjectFiling): boolean {
  return a.group === b.group && a.archived === b.archived
}

/**
 * Runs `run`, a section holding the lock of each project file it writes, and
 * puts back the times that file and its folder held, which the scanner reads
 * as the project's last edit. `run` calls `keep` under the lock before each
 * write, so the file's time is read after any writer that held the lock first.
 * The folder's time is read before the lock, since taking and dropping the
 * lock moves it, and goes back only where the file kept its time until `keep`,
 * so a writer that ran in between keeps the Edited time it earned.
 */
export async function keepingTimes<T>(
  files: string[],
  run: (keep: (file: string) => Promise<void>) => Promise<T>,
): Promise<T> {
  const before = new Map(
    await Promise.all(
      files.map(
        async (file) =>
          [
            file,
            {
              file: await stat(file).catch(() => undefined),
              folder: await stat(dirname(file)).catch(() => undefined),
            },
          ] as const,
      ),
    ),
  )
  const kept = new Map<string, Stats>()
  const keep = async (file: string) => {
    const time = await stat(file).catch(() => undefined)
    if (time && !kept.has(file)) kept.set(file, time)
  }
  const put = (path: string, time: Stats) =>
    utimes(path, time.atimeMs / 1000, time.mtimeMs / 1000).catch(() => {})
  try {
    return await run(keep)
  } finally {
    await Promise.all(
      [...kept].map(async ([file, time]) => {
        await put(file, time)
        const { file: was, folder } = before.get(file) ?? {}
        if (folder && was?.mtimeMs === time.mtimeMs) {
          await put(dirname(file), folder)
        }
      }),
    )
  }
}

/** Throws `name-taken` when another project holds `name` in any case. */
async function assertFree(
  root: string,
  name: string,
  self?: string,
): Promise<void> {
  const taken = matchName(
    (await listProjects(root)).filter((project) => project !== self),
    name,
  )
  if (taken) {
    throw new FrameboardError(
      'name-taken',
      `The board already has a project ${taken}.`,
      { name, taken },
    )
  }
}
