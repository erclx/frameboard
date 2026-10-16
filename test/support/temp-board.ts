import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface TempBoard {
  /** The realpath of the board folder. */
  root: string
  cleanup: () => void
}

/**
 * Writes a board from board-relative paths to contents, with `board.json`
 * added, so a test states the files its case turns on and nothing else.
 */
export function writeBoard(files: Record<string, string>): TempBoard {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-temp-')))
  const root = join(parent, 'board')
  for (const [path, contents] of Object.entries({
    'board.json': '{ "version": 1 }\n',
    ...files,
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), contents)
  }
  return {
    root,
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  }
}
