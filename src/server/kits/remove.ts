import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { withLayouts } from '@/server/board/frames'
import type { JournalOptions } from '@/server/board/journal'
import { resolveProject } from '@/server/board/refs'
import { listPageFolders } from '@/server/board/scan'
import type { KitRemoveRecord } from '@/shared/kits'

import { heldKit, projectKitDir } from './project'

/**
 * Takes a kit out of a project and clears it from every frame naming it,
 * under every page's lock, so no frame is left naming a folder that is
 * gone. Refuses `kit-not-found` for a name the project holds no kit under.
 */
export async function removeKit(
  root: string,
  ref: string,
  kit: string,
  { journal }: JournalOptions = {},
): Promise<KitRemoveRecord> {
  const project = await resolveProject(root, ref)
  const held = await heldKit(project, kit)
  const pages = (await listPageFolders(project.path)).map((page) =>
    join(project.path, page),
  )

  const frames = await withLayouts(
    pages,
    async (layouts) => {
      const cleared: string[] = []
      for (const [page, layout] of layouts) {
        for (const name of layout.names) {
          const { kit: named, ...rest } = layout.placement(name)
          if (named !== held) continue
          layout.set(name, rest)
          cleared.push(`${project.name}/${basename(page)}/${name}`)
        }
      }
      const folder = projectKitDir(project.path, held)
      if (journal) await journal.removed(folder)
      else await rm(folder, { recursive: true })
      return cleared
    },
    journal,
  )

  return { project: project.name, kit: held, frames }
}
