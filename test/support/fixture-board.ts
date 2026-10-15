import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type FixtureBoardName = 'basic' | 'hand-made' | 'broken'

export interface FixtureBoard {
  /** The realpath of the copy, so it compares equal to what the board resolves. */
  root: string
  cleanup: () => void
}

const FIXTURES = fileURLToPath(new URL('../fixtures/boards/', import.meta.url))

/** Copies one fixture board into a fresh temp folder, so a test can write to it. */
export function copyFixtureBoard(name: FixtureBoardName): FixtureBoard {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-board-')))
  const root = join(parent, name)
  // The e2e server and preview write .run/ into the basic board, so a copy leaves it behind.
  cpSync(join(FIXTURES, name), root, {
    recursive: true,
    filter: (source) => basename(source) !== '.run',
  })
  return {
    root,
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  }
}
