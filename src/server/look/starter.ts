import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { isCode } from '@/server/board/json-record'
import { resolveProject } from '@/server/board/refs'
import { tokenSheetPaths } from '@/server/checks/tokens'
import { TOKEN_FILE } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  type StarterLook,
  starterSheet,
  type StarterSheetRecord,
} from '@/shared/starter-tokens'

interface StarterOptions extends JournalOptions {
  /** The `--tokens` sheet a server was given, null for none, or absent to read the address file. */
  tokens?: string | null
}

/**
 * Writes a starter `tokens.css`, refusing `tokens-exist` where any sheet
 * already reaches the project, since it would override a chosen look.
 */
export async function writeStarterSheet(
  root: string,
  ref: string,
  look: StarterLook,
  { tokens, journal }: StarterOptions = {},
): Promise<StarterSheetRecord> {
  const project = await resolveProject(root, ref)
  const sheets = tokenSheetPaths(root, project.name, tokens)
  const existing = sheets.project ?? sheets.board
  if (existing) refuse(project.name, existing)

  const path = join(project.path, TOKEN_FILE)
  try {
    await writeFile(path, starterSheet(look), { flag: 'wx' })
  } catch (error) {
    if (isCode(error, 'EEXIST')) refuse(project.name, path)
    throw error
  }
  await journal?.created(path)
  return { project: project.name, path, ...look }
}

function refuse(project: string, sheet: string): never {
  throw new FrameboardError(
    'tokens-exist',
    `${project} already renders with the token sheet ${sheet}, so no starter sheet was written.`,
    { project, sheet },
  )
}
