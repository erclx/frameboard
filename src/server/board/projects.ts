import type { Stats } from 'node:fs'
import { cp, mkdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { FrameboardError } from '@/shared/errors'
import { nextFreeName, TITLE_MAX_LENGTH, titledFolder } from '@/shared/names'
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

export interface AddOptions extends JournalOptions {
  /** The home folder the project starts filed in, none leaving it loose. */
  group?: string
}

/** A new project holding one empty page, filed under `group` when one is given. */
export async function addProject(
  root: string,
  name: string,
  now: Date = new Date(),
  { journal, group }: AddOptions = {},
): Promise<ProjectRecord> {
  assertValidName('project', name)
  await assertFree(root, name)
  await mkdir(join(root, name, START_PAGE), { recursive: true })
  await writeRecord(join(root, name, PROJECT_FILE), {
    version: 1,
    pages: [START_PAGE],
    createdAt: now.toISOString(),
    ...(group?.trim() ? { group: group.trim() } : {}),
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
 * Sets a project's title and moves its folder to the name made from it. The
 * title goes in under the old folder before the move, so undo reverses them in
 * turn.
 */
export async function retitleProject(
  root: string,
  name: string,
  title: string,
  { journal }: JournalOptions = {},
): Promise<ProjectRecord> {
  const project = await resolveProject(root, name)
  const path = join(project.path, PROJECT_FILE)
  const trimmed = title.trim()
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new FrameboardError(
      'invalid-name',
      `A project title holds at most ${TITLE_MAX_LENGTH} characters.`,
      { title: trimmed },
    )
  }
  await keepingTimes([path], (keep) =>
    withLocks([path], async () => {
      const file = await readRecord(path, {
        ...projectSpec,
        empty: emptyProject,
      })
      const { title: _title, ...rest } = file
      const next = trimmed === '' ? rest : { ...rest, title: trimmed }
      const before = filingOf(file)
      const after = filingOf(next)
      if (isSameFiling(before, after)) return
      await keep(path)
      await writeRecord(path, next)
      journal?.project(path, before, after)
    }),
  )
  const moved = titledFolder(project.name, trimmed, await listProjects(root))
  if (moved === project.name) return scanProject(root, project.name)
  const target = join(root, moved)
  if (journal) await journal.moved(project.path, target)
  else await rename(project.path, target)
  return scanProject(root, moved)
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
 * Files projects at once under each file's lock, refusing all on an unparsed
 * file, and puts the times back, since a filing must not move the Edited sort.
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

/** The hand-written keys a project file holds, leaving out the ones it lacks. */
export function filingOf(file: ProjectFile): ProjectFiling {
  const off = isRecord(file.checks) ? file.checks.off : undefined
  return {
    ...(file.group === undefined ? {} : { group: file.group }),
    ...(file.archived === undefined ? {} : { archived: file.archived }),
    ...(file.title === undefined ? {} : { title: file.title }),
    ...(off === undefined ? {} : { off }),
  }
}

function isSameFiling(a: ProjectFiling, b: ProjectFiling): boolean {
  return (
    a.group === b.group &&
    a.archived === b.archived &&
    a.title === b.title &&
    isDeepStrictEqual(a.off, b.off)
  )
}

/** What a rule switch answers: the project and every rule id it now turns off. */
export interface ProjectRules {
  project: string
  off: string[]
}

/**
 * Turns a rule off or on in `checks.off` under the file's lock, refusing a
 * `checks` that is no object, and puts the times back as a filing does.
 */
export async function setProjectRule(
  root: string,
  name: string,
  rule: string,
  off: boolean,
  { journal }: JournalOptions = {},
): Promise<ProjectRules> {
  const project = await resolveProject(root, name)
  const path = join(project.path, PROJECT_FILE)
  return keepingTimes([path], (keep) =>
    withLocks([path], async () => {
      const file = await readRecord(path, {
        ...projectSpec,
        empty: emptyProject,
      })
      if (file.checks !== undefined && !isRecord(file.checks)) {
        throw new FrameboardError(
          'project-file-invalid',
          `${project.name}/${PROJECT_FILE} holds a checks value that is not an object. Make it an object and turn the rule off again.`,
          { project: project.name },
        )
      }
      const stored = filingOf(file).off
      const list = isRuleList(stored) ? stored : []
      const next = off
        ? list.includes(rule)
          ? list
          : [...list, rule]
        : list.filter((each) => each !== rule)
      if (next.length !== list.length) {
        const written = withOff(file, next.length === 0 ? undefined : next)
        await keep(path)
        await writeRecord(path, written)
        journal?.project(path, filingOf(file), filingOf(written))
      }
      return { project: project.name, off: next }
    }),
  )
}

/**
 * `file` with `checks.off` set or removed, dropping a `checks` it empties so
 * off and on leaves no empty object.
 */
export function withOff(file: ProjectFile, off: unknown): ProjectFile {
  if (
    off === undefined &&
    !(isRecord(file.checks) && file.checks.off !== undefined)
  ) {
    return file
  }
  const { off: _off, ...kept } = isRecord(file.checks) ? file.checks : {}
  const checks = off === undefined ? kept : { ...kept, off }
  if (Object.keys(checks).length > 0) return { ...file, checks }
  const { checks: _checks, ...rest } = file
  return rest
}

function isRuleList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((each) => typeof each === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Runs `run` and puts back the times the scanner reads as the last edit. The
 * folder's time is read before the lock, which moves it, and restored only if
 * no writer ran in between, so that writer keeps its Edited time.
 */
export async function keepingTimes<T>(
  files: string[],
  run: (keep: (file: string) => Promise<void>) => Promise<T>,
  land: (file: string) => string = (file) => file,
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
        const at = land(file)
        await put(at, time)
        const { file: was, folder } = before.get(file) ?? {}
        if (folder && was?.mtimeMs === time.mtimeMs) {
          await put(dirname(at), folder)
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
