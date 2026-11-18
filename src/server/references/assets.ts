import { statSync } from 'node:fs'
import { relative, sep } from 'node:path'

import {
  assetsDirOf,
  type FrameSource,
  isInside,
  localTarget,
} from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'
import { FrameboardError } from '@/shared/errors'

/**
 * The asset files a frame loads, refusing a page-folder load, since a reference
 * folder holds nothing it could resolve to.
 */
export function frameAssets(source: FrameSource): string[] {
  const assets = assetsDirOf(source)
  const found = new Set<string>()
  for (const load of frameLoads(source)) {
    const target = localTarget(load.url, load.base)
    if (target === null) continue
    if (!statSync(target, { throwIfNoEntry: false })?.isFile()) continue
    if (isInside(assets, target)) {
      found.add(relative(assets, target).split(sep).join('/'))
    } else if (isInside(source.pageDir, target)) {
      throw new FrameboardError(
        'page-file-load',
        `${source.ref} loads ${load.url} from its page folder, which a reference folder cannot hold. Move the file into the project's assets/ and link it there. Nothing written.`,
        { frame: source.ref, load: load.url },
      )
    }
  }
  return [...found].sort()
}
