import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { basename, dirname, relative } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { isCopied } from '@/server/board/pages'
import { assertValidName, matchName, resolveProject } from '@/server/board/refs'
import { FrameboardError } from '@/shared/errors'
import type { KitInstallRecord } from '@/shared/kits'

import { type FoundKit, readKitFile } from './list'
import { projectKitDir, projectKitNames } from './project'

/**
 * Adds a kit to a project as a copy of its folder under `assets/kits/`, so
 * a frame can name it, touching no token sheet and no page. Refuses
 * `name-taken` where the project holds a kit by that name, writing nothing.
 */
export async function installKit(
  root: string,
  ref: string,
  kit: Pick<FoundKit, 'name' | 'path'>,
  { journal }: JournalOptions = {},
): Promise<KitInstallRecord> {
  const project = await resolveProject(root, ref)
  assertValidName('kit', kit.name)
  const held = matchName(await projectKitNames(project.path), kit.name)
  const target = projectKitDir(project.path, kit.name)
  if (held !== undefined || existsSync(target)) {
    throw new FrameboardError(
      'name-taken',
      `${project.name} already holds a kit named ${held ?? kit.name}, so none was added. Remove it first with \`frameboard kit remove ${project.name} ${held ?? kit.name}\`.`,
      { project: project.name, kit: held ?? kit.name },
    )
  }
  await readKitFile(kit)

  const made = topmostMissing(target)
  await mkdir(dirname(target), { recursive: true })
  await cp(kit.path, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) => isKitFile(kit.path, path),
  })
  await journal?.created(made)

  return { project: project.name, kit: kit.name, written: [target] }
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
