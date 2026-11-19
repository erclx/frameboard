import { basename, join } from 'node:path'

import type { Token } from 'parse5'

import {
  boardPath,
  type FrameSource,
  type FrameTarget,
  localTarget,
} from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'
import { escapeAttribute } from '@/server/edit/attribute'

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
 * An element whose load moved takes the new file name while its `data-name` is still the old one, so a name set by hand stays.
 * A linked sheet's load, or a URL written through an entity or escape, stays for the link check to report.
 */
export function rewriteAssetLinks(
  source: FrameSource,
  from: string,
  to: string,
): string | null {
  const framePath = boardPath(source.root, source.path)
  const moved = new Map<string, { start: number; end: number; url: string }>()
  for (const load of frameLoads(source)) {
    if (load.path !== framePath || load.location === null) continue
    if (localTarget(load.url, load.base) !== from) continue
    const { startOffset: start, endOffset: end } = load.location
    moved.set(`${start}:${end}:${load.url}`, { start, end, url: load.url })
  }
  const loads = [...moved.values()]
  const edits: Edit[] = loads.map(({ start, end, url }) => ({
    start,
    end,
    write: (span) =>
      span.replace(
        urlPattern(url),
        (_, lead: string) => `${lead}${renamedUrl(url, basename(to))}`,
      ),
  }))
  // A name follows only a load that was rewritten, so a load left for the link check keeps its element's name too.
  const rewritten = loads.filter(({ start, end, url }) =>
    urlPattern(url).test(source.html.slice(start, end)),
  )
  edits.push(...nameEdits(source, rewritten, basename(from), basename(to)))
  let html = source.html
  for (const { start, end, write } of edits.sort((a, b) => b.start - a.start)) {
    html =
      html.slice(0, start) + write(html.slice(start, end)) + html.slice(end)
  }
  return html === source.html ? null : html
}

interface Edit {
  start: number
  end: number
  write: (span: string) => string
}

/** A `data-name` of `oldName` set to `newName` on each element one of `loads` sits in. */
function nameEdits(
  source: FrameSource,
  loads: { start: number }[],
  oldName: string,
  newName: string,
): Edit[] {
  return source.elements.flatMap((element) => {
    if (element.attribs['data-name'] !== oldName) return []
    // The adapter stores parse5's own location, which names each attribute.
    const tag = element.sourceCodeLocation as Token.ElementLocation | undefined
    const name = tag?.attrs?.['data-name']
    const startTag = tag?.startTag
    if (!name || !startTag) return []
    const holds = loads.some(
      ({ start }) =>
        start >= startTag.startOffset && start < startTag.endOffset,
    )
    if (!holds) return []
    return [
      {
        start: name.startOffset,
        end: name.endOffset,
        write: () => `data-name="${escapeAttribute(newName)}"`,
      },
    ]
  })
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
