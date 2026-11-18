import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ASSETS_FOLDER } from '@/shared/board-files'
import { KIT_FILE, PROJECT_KITS } from '@/shared/kits'
import { isValidName } from '@/shared/names'
import type { PageRecord, ProjectKitRecord } from '@/shared/records/list'

/** The folder a project keeps the kit named `kit` in, which a caller checks is a valid name first. */
export function projectKitDir(projectDir: string, kit: string): string {
  return join(projectDir, ASSETS_FOLDER, PROJECT_KITS, kit)
}

/**
 * The kits a project added, sorted by name, being each folder under its
 * `assets/kits/` a frame could name. A hand-built folder counts, since a
 * kit reaches a frame only where the frame names it.
 */
export async function projectKitNames(projectDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(projectDir, ASSETS_FOLDER, PROJECT_KITS), {
      withFileTypes: true,
    })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && isValidName(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/**
 * A project's kits as `list --json` answers them, each with how many of
 * `pages`' frames name it. The pages come scanned, so a scan never reads
 * a layout twice.
 */
export async function projectKits(
  projectDir: string,
  pages: readonly Pick<PageRecord, 'frames'>[],
): Promise<ProjectKitRecord[]> {
  const named = pages.flatMap((page) => page.frames.map((frame) => frame.kit))
  const names = await projectKitNames(projectDir)
  return Promise.all(
    names.map(async (name) => ({
      name,
      title: await titleOf(projectKitDir(projectDir, name), name),
      frameCount: named.filter((kit) => kit === name).length,
    })),
  )
}

/** The title a kit's `kit.json` gives, or its folder name where the file gives none. */
async function titleOf(kitDir: string, name: string): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(kitDir, KIT_FILE), 'utf8'),
    )
    const title =
      typeof parsed === 'object' && parsed !== null && 'title' in parsed
        ? parsed.title
        : undefined
    return typeof title === 'string' && title.trim() !== ''
      ? title.trim()
      : name
  } catch {
    return name
  }
}
