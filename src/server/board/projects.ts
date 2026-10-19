import { cp, mkdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import { nextFreeName } from '@/shared/names'
import type { ProjectRecord } from '@/shared/records/list'

import type { JournalOptions } from './journal'
import { readRecord, writeRecord } from './json-record'
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
  await writeRecord(join(copyPath, PROJECT_FILE), {
    ...file,
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
