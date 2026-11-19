import { basename, join } from 'node:path'

import {
  boardPath,
  type FrameSource,
  type FrameTarget,
  localTarget,
} from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'

import { linkedAssets } from './asset-usage'
import { listFrames, listPageFolders } from './scan'

/** Every frame in the project linking the file at `path` under its `assets/`. */
export async function framesLinking(
  root: string,
  project: string,
  path: string,
): Promise<FrameTarget[]> {
  const projectDir = join(root, project)
  const frames: FrameTarget[] = []
  for (const page of await listPageFolders(projectDir)) {
    for (const name of await listFrames(join(projectDir, page))) {
      if (linkedAssets(root, project, page, name).has(path)) {
        frames.push({ root, project, page, name })
      }
    }
  }
  return frames
}

/**
 * The frame's markup with each load of `from` pointed at `to`, or null when no load in its own file names it.
 * A linked sheet's load, or a URL written through an entity or escape, stays for the link check to report.
 */
export function rewriteAssetLinks(
  source: FrameSource,
  from: string,
  to: string,
): string | null {
  const framePath = boardPath(source.root, source.path)
  const edits = new Map<string, { start: number; end: number; url: string }>()
  for (const load of frameLoads(source)) {
    if (load.path !== framePath || load.location === null) continue
    if (localTarget(load.url, load.base) !== from) continue
    const { startOffset: start, endOffset: end } = load.location
    edits.set(`${start}:${end}:${load.url}`, { start, end, url: load.url })
  }
  let html = source.html
  let changed = false
  const ordered = [...edits.values()].sort((a, b) => b.start - a.start)
  for (const { start, end, url } of ordered) {
    const span = html.slice(start, end)
    const written = span.replace(urlPattern(url), (_, lead: string) => {
      changed = true
      return `${lead}${renamedUrl(url, basename(to))}`
    })
    html = html.slice(0, start) + written + html.slice(end)
  }
  return changed ? html : null
}

/** The URL as a whole token, so `a.jpg` never matches inside `a.jpg-2.jpg`. */
function urlPattern(url: string): RegExp {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|["'(\\s,=])${escaped}(?=$|["')\\s,])`, 'g')
}

/** The URL with its last path segment swapped for `name`, keeping its query and fragment. */
function renamedUrl(url: string, name: string): string {
  const cut = url.search(/[?#]/)
  const path = cut === -1 ? url : url.slice(0, cut)
  const rest = cut === -1 ? '' : url.slice(cut)
  const slash = path.lastIndexOf('/')
  return `${path.slice(0, slash + 1)}${encodeURIComponent(name)}${rest}`
}
