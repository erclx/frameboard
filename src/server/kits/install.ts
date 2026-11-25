import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { isCopied } from '@/server/board/pages'
import { assertValidName, matchName, resolveProject } from '@/server/board/refs'
import { FrameboardError } from '@/shared/errors'
import type { KitInstallRecord } from '@/shared/kits'

import { type FoundKit, readKitFile } from './list'
import { projectKitDir, projectKitNames } from './project'

/** A replace takes no journal, since no step brings back the copy it deletes. */
type InstallOptions =
  | (JournalOptions & { replace?: false })
  | { journal?: undefined; replace?: boolean }

/**
 * Copies a kit's folder into a project's `assets/kits/`, touching no token
 * sheet and no page. Over a kit the project holds, refuses `name-taken` or,
 * under `replace`, swaps in the copy under the name it is held by.
 */
export async function installKit(
  root: string,
  ref: string,
  kit: Pick<FoundKit, 'name' | 'path'>,
  { journal, replace = false }: InstallOptions = {},
): Promise<KitInstallRecord> {
  const project = await resolveProject(root, ref)
  assertValidName('kit', kit.name)
  const held = matchName(await projectKitNames(project.path), kit.name)
  const name = held ?? kit.name
  const target = projectKitDir(project.path, name)
  const swaps = replace && held !== undefined
  if (!swaps && (held !== undefined || existsSync(target))) {
    throw new FrameboardError(
      'name-taken',
      `${project.name} already holds a kit named ${name}, so none was added. Remove it first with \`frameboard kit remove ${project.name} ${name}\`.`,
      { project: project.name, kit: name },
    )
  }
  await readKitFile(kit)

  const record = { project: project.name, kit: name, written: [target] }
  if (swaps) {
    await swapIn(kit.path, target)
    return { ...record, replaced: true }
  }
  const made = topmostMissing(target)
  await mkdir(dirname(target), { recursive: true })
  await cp(kit.path, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) => isKitFile(kit.path, path),
  })
  await journal?.created(made)

  return record
}

/**
 * Puts a copy of the kit folder in place of the one at `target`, staged whole
 * in a dot folder beside it, so a failed copy leaves the held kit as it was.
 */
async function swapIn(kitPath: string, target: string): Promise<void> {
  const stage = await mkdtemp(join(dirname(target), `.${basename(target)}.`))
  const copy = join(stage, 'copy')
  const aside = join(stage, 'held')
  try {
    await cp(kitPath, copy, {
      recursive: true,
      // A link into the held kit would point at itself once the copy takes its place.
      dereference: true,
      filter: (path) => isKitFile(kitPath, path),
    })
    await rename(target, aside)
    await rename(copy, target).catch(async (error: unknown) => {
      await rename(aside, target)
      throw error
    })
  } finally {
    // With no folder at the target, the one set aside is the project's only copy.
    if (existsSync(target)) await rm(stage, { recursive: true, force: true })
  }
}

/** The highest folder on the way to `path` that does not exist yet, which an undo removes whole. */
function topmostMissing(path: string): string {
  const parent = dirname(path)
  return existsSync(parent) ? path : topmostMissing(parent)
}

/** Whether a path in the kit folder is copied, being anything but a dot-named entry or a lock or temp file. */
function isKitFile(kitPath: string, path: string): boolean {
  const inside = relative(kitPath, path)
  if (inside === '') return true
  return (
    !inside.split('/').some((part) => part.startsWith('.')) &&
    isCopied(basename(path))
  )
}
