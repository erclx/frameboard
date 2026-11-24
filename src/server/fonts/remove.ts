import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { resolveProject } from '@/server/board/refs'
import type { FontRemove } from '@/shared/records/sourcing'

import { fontsDir, heldFont, isBundled } from './installed'
import { framesByFamily } from './usage'

/**
 * Takes an installed family out of a project and answers the frames left
 * falling back, whose files it never changes. Refuses `font-not-found` for an
 * id the project has not installed, a hand-filled folder included.
 */
export async function removeFont(
  root: string,
  ref: string | undefined,
  id: string,
  { journal }: JournalOptions = {},
): Promise<FontRemove> {
  const project = await resolveProject(root, ref)
  const font = await heldFont(project, id)
  const { family } = font.record
  const named = isBundled(family) ? [] : [family]
  const frames = await framesByFamily(root, project.name, named)
  const folder = join(fontsDir(project.path), font.id)
  if (journal) await journal.removed(folder)
  else await rm(folder, { recursive: true })
  return {
    version: 1,
    project: project.name,
    id: font.id,
    family,
    frames: frames.get(family) ?? [],
  }
}
