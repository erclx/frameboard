import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'

import { listFrames, listPageFolders } from '@/server/board/scan'
import { buildCascade } from '@/server/checks/cascade'
import { textElements } from '@/server/checks/fonts'
import { readProjectContext } from '@/server/checks/frame'
import {
  type FrameSource,
  type FrameTarget,
  readFrame,
  type Sheet,
} from '@/server/checks/frame-source'
import { frameKit } from '@/server/checks/tokens'

/**
 * The refs of the frames drawing text in each family, in page then frame
 * order, reading the one family `font-missing` judges: the first of a text
 * element's stack.
 */
export async function framesByFamily(
  root: string,
  project: string,
  families: readonly string[],
): Promise<Map<string, string[]>> {
  const frames = new Map(
    families.map((family) => [family, [] as string[]] as const),
  )
  if (families.length === 0) return frames
  const { tokens } = readProjectContext(root, project)
  for (const target of await projectFrames(root, project)) {
    // A large project's cascades would otherwise hold the server's one thread.
    await setImmediate()
    const source = readOrNull(target)
    if (source === null) continue
    const sheets = tokens(frameKit(target))
    const named = families.filter((family) => names(source, sheets, family))
    if (named.length === 0) continue
    const cascade = buildCascade(source, sheets)
    const drawn = new Set(
      textElements(source).map((element) =>
        cascade.firstFamily(element)?.toLowerCase(),
      ),
    )
    for (const family of named) {
      if (drawn.has(family.toLowerCase())) frames.get(family)?.push(source.ref)
    }
  }
  return frames
}

/** Whether a frame's file or any sheet reaching it holds the family's name, which spares most frames a cascade. */
function names(
  source: FrameSource,
  sheets: readonly Sheet[],
  family: string,
): boolean {
  const sought = family.toLowerCase()
  return [source.html, ...[...sheets, ...source.sheets].map(({ css }) => css)]
    .map((text) => text.toLowerCase())
    .some((text) => text.includes(sought))
}

async function projectFrames(
  root: string,
  project: string,
): Promise<FrameTarget[]> {
  const projectDir = join(root, project)
  const pages = await listPageFolders(projectDir)
  const listed = await Promise.all(
    pages.map(async (page) =>
      (await listFrames(join(projectDir, page))).map((name) => ({
        root,
        project,
        page,
        name,
      })),
    ),
  )
  return listed.flat()
}

/** The frame's source, null for one deleted or unreadable since the listing. */
function readOrNull(target: FrameTarget): FrameSource | null {
  try {
    return readFrame(target)
  } catch {
    return null
  }
}
