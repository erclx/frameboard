import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

/** The folder home opens on in a reel, holding two projects the fixture lacks. */
const FOLDER = { name: 'Drives', projects: ['drive-app', 'drive-site'] }

/** The raw colors page, which the first project's one frame shows. */
const APP_PAGE = join(import.meta.dirname, '../drive-raw.html')

/**
 * Files two projects of one page each in the Drives folder, so a reel opens a
 * folder, renames it, and deletes a project out of it. The first holds one
 * frame, so the folder card draws a capture. A changed folder is kept.
 */
export async function lay(root: string): Promise<'laid' | 'kept'> {
  if (FOLDER.projects.some((project) => existsSync(join(root, project))))
    return 'kept'
  await Promise.all(
    FOLDER.projects.map(async (project, index) => {
      const page = join(root, project, 'home')
      await mkdir(page, { recursive: true })
      const framed = index === 0
      const frames = framed
        ? {
            app: {
              x: 0,
              y: 0,
              order: 0,
              hidden: false,
              locked: false,
              ...FRAME_SIZES.desktop,
            },
          }
        : {}
      await Promise.all([
        framed ? copyFile(APP_PAGE, join(page, 'app.html')) : undefined,
        writeFile(
          join(page, 'layout.json'),
          `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
        ),
        writeFile(
          join(root, project, 'project.json'),
          `${JSON.stringify({ version: 1, pages: ['home'], group: FOLDER.name }, null, 2)}\n`,
        ),
      ])
    }),
  )
  return 'laid'
}
