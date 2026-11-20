import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A project whose folder name is one run no line break rescues, with its own
 * token sheet, so the Theme tab's note has a sheet path wider than itself.
 */
const LONG_PATH = 'northwindbrandsystemworkspacedesigntokens'

/** Lays the long sheet path project, one empty page and a token sheet stating one color. */
export async function lay(root: string): Promise<'laid' | 'kept'> {
  if (existsSync(join(root, LONG_PATH))) return 'kept'
  await mkdir(join(root, LONG_PATH, 'home'), { recursive: true })
  await Promise.all([
    writeFile(
      join(root, LONG_PATH, 'home', 'layout.json'),
      `${JSON.stringify({ version: 1, frames: {} }, null, 2)}\n`,
    ),
    writeFile(
      join(root, LONG_PATH, 'project.json'),
      `${JSON.stringify({ version: 1, pages: ['home'] }, null, 2)}\n`,
    ),
    writeFile(
      join(root, LONG_PATH, 'tokens.css'),
      ':root {\n  --brand: #0f766e;\n}\n',
    ),
  ])
  return 'laid'
}
