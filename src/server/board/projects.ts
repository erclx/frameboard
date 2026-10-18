import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import type { ProjectRecord } from '@/shared/records/list'

import { writeRecord } from './json-record'
import { assertValidName, matchName, resolveProject } from './refs'
import { START_PAGE } from './root'
import { listProjects, PROJECT_FILE, scanProject } from './scan'

/** A new project holding one empty page. */
export async function addProject(
  root: string,
  name: string,
  now: Date = new Date(),
): Promise<ProjectRecord> {
  assertValidName('project', name)
  await assertFree(root, name)
  await mkdir(join(root, name, START_PAGE), { recursive: true })
  await writeRecord(join(root, name, PROJECT_FILE), {
    version: 1,
    pages: [START_PAGE],
    createdAt: now.toISOString(),
  })
  return scanProject(root, name)
}

export async function renameProject(
  root: string,
  name: string,
  newName: string,
): Promise<ProjectRecord> {
  const project = await resolveProject(root, name)
  assertValidName('project', newName)
  await assertFree(root, newName, project.name)
  await rename(project.path, join(root, newName))
  return scanProject(root, newName)
}

export async function deleteProject(
  root: string,
  name: string,
): Promise<{ deleted: string }> {
  const project = await resolveProject(root, name)
  await rm(project.path, { recursive: true, force: true })
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
