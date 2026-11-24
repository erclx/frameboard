import { lstat, readdir, realpath, rm, rmdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'

import { isCode } from '@/server/board/json-record'
import { FrameboardError } from '@/shared/errors'
import { isReservedPageName } from '@/shared/names'

import { isCompositeImageName, isFrameImageName } from './images'

/**
 * Refuses `usage` where a prune would reach the board's own files, which a
 * frame may link. A dot-named folder of the board holds none, so it passes.
 */
export async function assertPrunable(
  root: string,
  out: string,
  project: string,
): Promise<void> {
  const folder = join(out, project)
  const [target, ...sources] = await Promise.all(
    [folder, root, join(root, project)].map(resolvedPath),
  )
  if (sources.some((source) => holds(source, target ?? folder))) {
    throw new FrameboardError(
      'usage',
      `--prune would remove files from ${folder}, which is part of the board. Pass an --out outside the board.`,
      { folder },
    )
  }
}

/** Whether `path` is `source` or below it, outside its dot-named folders. */
function holds(source: string, path: string): boolean {
  const inside = relative(source, path)
  // A path outside `source` opens on `..`, so one test reads both.
  return !inside.startsWith('.')
}

/** The real path of `path`, through its nearest folder that exists. */
async function resolvedPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    if (!isCode(error, 'ENOENT') || dirname(path) === path) throw error
    return join(await resolvedPath(dirname(path)), basename(path))
  }
}

/**
 * Removes every image a capture could have written under `<out>/<project>` but
 * those at `kept`, with each page folder that empties, and returns the files
 * removed, sorted. Nothing behind a link goes, the project's folder included.
 */
export async function pruneImages(
  out: string,
  project: string,
  kept: readonly string[],
): Promise<string[]> {
  const folder = join(out, project)
  if (!(await lstat(folder)).isDirectory()) return []

  const keptFiles = new Set(await Promise.all(kept.map(fileIdentity)))
  const stale = async (dir: string, isImage: (file: string) => boolean) => {
    const entries = await readdir(dir, { withFileTypes: true })
    const images = entries
      .filter((entry) => entry.isFile() && isImage(entry.name))
      .map((entry) => join(dir, entry.name))
    const identities = await Promise.all(images.map(fileIdentity))
    return images.filter((_, index) => !keptFiles.has(identities[index] ?? ''))
  }

  const pageFolders = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isPageName(entry.name))
    .map((entry) => join(folder, entry.name))
  const composites = await stale(folder, isCompositeImageName)
  const byPage = await Promise.all(
    pageFolders.map((dir) => stale(dir, isFrameImageName)),
  )

  const removed = [...composites, ...byPage.flat()]
  await Promise.all(removed.map((path) => rm(path, { force: true })))
  await Promise.all(
    pageFolders
      .filter((_, index) => (byPage[index]?.length ?? 0) > 0)
      .map(removeIfEmpty),
  )
  return removed.sort()
}

function isPageName(name: string): boolean {
  return !name.startsWith('.') && !isReservedPageName(name)
}

// The file rather than its path, since a disk that ignores case lists a
// renamed frame's image under the old spelling.
async function fileIdentity(path: string): Promise<string> {
  const { dev, ino } = await stat(path, { bigint: true })
  return `${dev}:${ino}`
}

async function removeIfEmpty(dir: string): Promise<void> {
  if ((await readdir(dir)).length === 0) await rmdir(dir)
}
