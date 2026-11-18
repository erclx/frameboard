import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ADDRESS_FILE,
  ASSETS_FOLDER,
  LAYOUT_FILE,
  RUN_FOLDER,
  TOKEN_FILE,
} from '@/shared/board-files'
import {
  KIT_ASSETS,
  KIT_FILE,
  KIT_SHEET,
  kitOf,
  PROJECT_KITS,
} from '@/shared/kits'

import type { FrameTarget, Sheet } from './frame-source'

/** The token sheets a project's frames render with, each null when no file exists. */
export interface TokenSheetPaths {
  /** The `--tokens` sheet a running server was given, else the board's `tokens.css`. */
  board: string | null
  /** The project's own `tokens.css`, which overrides the board sheet. */
  project: string | null
}

/**
 * Where a project's token sheets sit, the address file read by plain
 * `JSON.parse`, since the write hook cannot afford its schema.
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
 * The kit a frame's layout entry names, null for none or a layout that does
 * not read, parsed plainly as the address file is.
 */
export function frameKit({
  root,
  project,
  page,
  name,
}: FrameTarget): string | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(root, project, page, LAYOUT_FILE), 'utf8'),
    )
    const frames = keyOf(parsed, 'frames')
    return kitOf(keyOf(keyOf(frames, name), 'kit'))
  } catch {
    return null
  }
}

/** An object's own key, undefined for a value holding none. */
function keyOf(value: unknown, key: string): unknown {
  return typeof value === 'object' &&
    value !== null &&
    Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

/**
 * The kit sheets a frame draws with, as paths under its project in cascade
 * order: a project-wide kit's where `assets/kit/` holds `kit.json`, then the
 * tokens and stylesheet of the kit the frame names, each that exists.
 */
export function kitSheetFiles(
  root: string,
  project: string,
  kit: string | null,
): string[] {
  const wide = [ASSETS_FOLDER, KIT_ASSETS]
  const named = kitOf(kit)
  const files = [
    ...(existsSync(join(root, project, ...wide, KIT_FILE))
      ? [[...wide, KIT_SHEET]]
      : []),
    ...(named
      ? [TOKEN_FILE, KIT_SHEET].map((file) => [
          ASSETS_FOLDER,
          PROJECT_KITS,
          named,
          file,
        ])
      : []),
  ]
  return files
    .filter((file) => existsSync(join(root, project, ...file)))
    .map((file) => file.join('/'))
}

/**
 * The sheets the frame route imports ahead of a frame, being the board's
 * tokens, the project's, then its kit sheets, which the cascade reads ahead
 * of the frame's own. `kit` is the kit the frame names, null for a plain one.
 */
export function tokenSheets(
  root: string,
  project: string,
  tokens?: string | null,
  kit: string | null = null,
): Sheet[] {
  return readSheets(root, project, tokenSheetPaths(root, project, tokens), kit)
}

/** `tokenSheets` for a caller already holding the project's sheet paths. */
export function readSheets(
  root: string,
  project: string,
  paths: TokenSheetPaths,
  kit: string | null,
): Sheet[] {
  const kitSheets = kitSheetFiles(root, project, kit).map((file) =>
    join(root, project, file),
  )
  return [paths.board, paths.project, ...kitSheets]
    .filter((path) => path !== null)
    .map((path) => ({
      css: readFileSync(path, 'utf8'),
      origin: 'token',
      path,
      offset: 0,
    }))
}
