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
 * The files a frame loads inside its project's `assets/`, by their path there,
 * sorted and each once. A load naming no file is left to the link check's
 * `missing-file`, so it copies nothing here. A file in the frame's page folder
 * refuses `page-file-load`, since the link check allows it and a reference
 * folder holds nothing it could resolve to, so it would land broken.
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
