import { existsSync } from 'node:fs'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { DEFAULT_BOARD_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'

import { isCode, writeRecord } from './json-record'
import { BOARD_FILE, listProjects, PROJECT_FILE } from './scan'

export { DEFAULT_BOARD_FOLDER }
export const START_PROJECT = 'untitled'
export const START_PAGE = 'page-1'

export interface BoardLocation {
  /** `--root` as given, resolved against `cwd`. */
  root?: string
  cwd: string
}

/**
 * The board a verb acts on, as an absolute realpath. `--root` names it
 * outright, marker or not. Otherwise the walk up from `cwd` takes the first
 * folder holding `board.json` or `.frameboard/board.json`, and stops after
 * the first folder holding `.git`.
 */
export async function resolveBoard({
  root,
  cwd,
}: BoardLocation): Promise<string> {
  if (root !== undefined) {
    const path = resolve(cwd, root)
    if (!(await isDirectory(path))) {
      throw new FrameboardError(
        'board-not-found',
        `No board folder at ${path}.`,
        { root: path },
      )
    }
    return realpath(path)
  }

  const found = findBoard(cwd)
  if (!found) {
    throw new FrameboardError(
      'board-not-found',
      `No board.json in ${cwd} or any folder above it up to the repository top. Run frameboard serve to start one, or pass --root.`,
      { cwd },
    )
  }
  return realpath(found)
}

export function findBoard(cwd: string): string | null {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, BOARD_FILE))) return dir
    if (existsSync(join(dir, DEFAULT_BOARD_FOLDER, BOARD_FILE))) {
      return join(dir, DEFAULT_BOARD_FOLDER)
    }
    if (existsSync(join(dir, '.git')) || dirname(dir) === dir) return null
  }
}

/**
 * The board `serve` shows, started when none exists: at `--root` when given,
 * else the board the walk finds, else `.frameboard/` in `cwd`. A board folder holding no project gets one
 * project with one empty page, and one missing only `board.json` gets that
 * alone.
 */
export async function startBoard(
  { root, cwd }: BoardLocation,
  now: Date = new Date(),
): Promise<{ root: string; created: boolean }> {
  const target =
    root === undefined
      ? (findBoard(cwd) ?? join(cwd, DEFAULT_BOARD_FOLDER))
      : resolve(cwd, root)

  await mkdir(target, { recursive: true })
  if (!existsSync(join(target, BOARD_FILE))) {
    await writeRecord(join(target, BOARD_FILE), { version: 1 })
  }

  let created = false
  if ((await listProjects(target)).length === 0) {
    const page = join(target, START_PROJECT, START_PAGE)
    await mkdir(page, { recursive: true })
    await writeRecord(join(target, START_PROJECT, PROJECT_FILE), {
      version: 1,
      pages: [START_PAGE],
      createdAt: now.toISOString(),
    })
    created = true
  }
  return { root: await realpath(target), created }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
}
