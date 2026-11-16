import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ADDRESS_FILE,
  ASSETS_FOLDER,
  RUN_FOLDER,
  TOKEN_FILE,
} from '@/shared/board-files'
import { KIT_ASSETS, KIT_SHEET } from '@/shared/kits'

import type { Sheet } from './frame-source'

/** The token sheets a project's frames render with, each null when no file exists. */
export interface TokenSheetPaths {
  /** The `--tokens` sheet a running server was given, else the board's `tokens.css`. */
  board: string | null
  /** The project's own `tokens.css`, which overrides the board sheet. */
  project: string | null
}

/**
 * Where a project's token sheets sit. The board sheet is the one `serve
 * --tokens` recorded in the address file, else the board folder's own, and
 * `tokens` stands in for the address file where the caller already knows it.
 * The address file is read with a plain `JSON.parse` rather than its schema,
 * which the write hook cannot afford to load.
 */
export function tokenSheetPaths(
  root: string,
  project: string,
  tokens?: string | null,
): TokenSheetPaths {
  const own = join(root, project, TOKEN_FILE)
  return {
    board: boardSheetPath(root, tokens),
    project: existsSync(own) ? own : null,
  }
}

/** The board's token sheet alone, resolved the way `tokenSheetPaths` resolves it. */
export function boardSheetPath(
  root: string,
  tokens: string | null = recordedTokens(root),
): string | null {
  const board = tokens ?? join(root, TOKEN_FILE)
  return existsSync(board) ? board : null
}

/** The `--tokens` path the board's running server recorded, or null. */
export function recordedTokens(root: string): string | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(root, RUN_FOLDER, ADDRESS_FILE), 'utf8'),
    )
    const tokens =
      typeof parsed === 'object' && parsed !== null && 'tokens' in parsed
        ? parsed.tokens
        : undefined
    return typeof tokens === 'string' ? tokens : null
  } catch {
    return null
  }
}

/**
 * The sheets the frame route imports ahead of a project's frames, being the
 * board's tokens, then the project's, then an installed kit's stylesheet,
 * which the cascade reads ahead of each frame's own sheets.
 */
export function tokenSheets(
  root: string,
  project: string,
  tokens?: string | null,
): Sheet[] {
  const paths = tokenSheetPaths(root, project, tokens)
  const kit = join(root, project, ASSETS_FOLDER, KIT_ASSETS, KIT_SHEET)
  return [paths.board, paths.project, existsSync(kit) ? kit : null]
    .filter((path) => path !== null)
    .map((path) => ({
      css: readFileSync(path, 'utf8'),
      origin: 'token',
      path,
      offset: 0,
    }))
}
