import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The transition of webapp's own the deck's closing slide arrives with, so
 * present mode has a project's keyframes to play and the inspector's two
 * lists a name to show after the built-ins.
 */
export const WIPE = { project: 'webapp', name: 'wipe', ms: 700 }

const WIPE_SHEET = join(import.meta.dirname, '../drive-transition.css')

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, WIPE.project, 'assets', 'transitions')
  const sheet = join(folder, `${WIPE.name}.css`)
  if (existsSync(sheet)) return 'kept'
  await mkdir(folder, { recursive: true })
  await copyFile(WIPE_SHEET, sheet)
  return 'laid'
}
