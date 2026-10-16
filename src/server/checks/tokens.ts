import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Sheet } from './frame-source'

export const TOKEN_FILE = 'tokens.css'

/**
 * The token sheets a project's frames render with, board-wide first and then
 * the project's own, which the cascade reads ahead of each frame's sheets.
 */
export function tokenSheets(root: string, project: string): Sheet[] {
  return [join(root, TOKEN_FILE), join(root, project, TOKEN_FILE)]
    .filter((path) => existsSync(path))
    .map((path) => ({
      css: readFileSync(path, 'utf8'),
      origin: 'token',
      path,
      offset: 0,
    }))
}
