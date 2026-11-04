import { statSync } from 'node:fs'
import { relative, sep } from 'node:path'

import {
  assetsDirOf,
  type FrameSource,
  isInside,
  localTarget,
} from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'

/**
 * The files a frame loads inside its project's `assets/`, by their path there,
 * sorted and each once. A load naming no file is left to the link check's
 * `missing-file`, so it copies nothing here.
 */
export function frameAssets(source: FrameSource): string[] {
  const assets = assetsDirOf(source)
  const found = new Set<string>()
  for (const load of frameLoads(source)) {
    const target = localTarget(load.url, load.base)
    if (target === null || !isInside(assets, target)) continue
    if (!statSync(target, { throwIfNoEntry: false })?.isFile()) continue
    found.add(relative(assets, target).split(sep).join('/'))
  }
  return [...found].sort()
}
