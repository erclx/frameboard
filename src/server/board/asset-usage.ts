import { join, relative, sep } from 'node:path'

import {
  assetsDirOf,
  isInside,
  localTarget,
  readFrame,
} from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'

import { listFrames, listPageFolders } from './scan'

/** Each file under a project's `assets/`, by its path there, with the number of frames linking it. */
export type AssetCounts = ReadonlyMap<string, number>

export interface AssetUsage {
  /** The project's counts, built on the first read and answered from the cache after. */
  counts: (project: string) => Promise<AssetCounts>
  /** Drops every project a watcher batch's absolute paths reach into, so its next read rebuilds. */
  drop: (paths: readonly string[]) => void
}

/**
 * A per-project cache of how many frames link each asset, counted from the
 * same loads the link check judges. A frame counts once per file, and only a
 * link resolving inside the project's `assets/` counts.
 */
export function createAssetUsage(root: string): AssetUsage {
  const cache = new Map<string, Promise<AssetCounts>>()

  return {
    counts: (project) => {
      const cached = cache.get(project)
      if (cached) return cached
      const built = countProject(root, project)
      cache.set(project, built)
      built.catch(() => {
        if (cache.get(project) === built) cache.delete(project)
      })
      return built
    },
    drop: (paths) => {
      for (const path of paths) {
        const inside = relative(root, path)
        if (inside === '') {
          cache.clear()
          return
        }
        if (inside.startsWith('..')) continue
        const project = inside.split(sep)[0]
        if (project) cache.delete(project)
      }
    },
  }
}

async function countProject(
  root: string,
  project: string,
): Promise<AssetCounts> {
  const projectDir = join(root, project)
  const counts = new Map<string, number>()
  for (const page of await listPageFolders(projectDir)) {
    for (const name of await listFrames(join(projectDir, page))) {
      for (const path of linkedAssets(root, project, page, name)) {
        counts.set(path, (counts.get(path) ?? 0) + 1)
      }
    }
  }
  return counts
}

/** The asset paths one frame links, each once. A frame gone between the listing and the read links none. */
function linkedAssets(
  root: string,
  project: string,
  page: string,
  name: string,
): Set<string> {
  const linked = new Set<string>()
  let source
  try {
    source = readFrame({ root, project, page, name })
  } catch {
    return linked
  }
  const assets = assetsDirOf(source)
  for (const load of frameLoads(source)) {
    const target = localTarget(load.url, load.base)
    if (target === null || target === assets || !isInside(assets, target)) {
      continue
    }
    linked.add(relative(assets, target).split(sep).join('/'))
  }
  return linked
}
