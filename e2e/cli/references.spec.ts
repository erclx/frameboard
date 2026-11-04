import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

async function references(
  board: FixtureBoard,
  args: string[],
): Promise<{
  exitCode: number
  envelope: { ok: boolean; error?: { code: string } }
}> {
  try {
    const { stdout } = await run('node', [
      CLI,
      'references',
      'sync',
      ...args,
      '--root',
      board.root,
      '--json',
    ])
    return { exitCode: 0, envelope: JSON.parse(stdout) }
  } catch (error) {
    const failed = error as { code: number; stdout: string }
    return { exitCode: failed.code, envelope: JSON.parse(failed.stdout) }
  }
}

test.describe('references sync', () => {
  let board: FixtureBoard
  let folder: string

  test.beforeEach(() => {
    board = copyFixtureBoard('capture')
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-references-')))
    writeFileSync(
      join(folder, 'frames.json'),
      JSON.stringify({
        frames: {
          'home/hero': 'studio/home/hero',
          'home/geist': 'studio/home/geist',
        },
      }),
    )
  })

  test.afterEach(() => {
    board.cleanup()
    rmSync(folder, { recursive: true, force: true })
  })

  test('should land the frames, then pass a check, then fail one on a hand edit', async () => {
    const synced = await references(board, [folder])

    expect(synced.exitCode).toBe(0)
    for (const file of [
      'home/hero.html',
      'home/hero-light.png',
      'home/hero-dark.png',
      'home/geist.html',
      'home/geist-light.png',
      'home/geist-dark.png',
      'assets/studio/geist.woff2',
    ]) {
      expect(existsSync(join(folder, file)), file).toBe(true)
    }
    expect(readFileSync(join(folder, 'home/geist.html'), 'utf8')).toContain(
      '../assets/studio/geist.woff2',
    )

    const clean = await references(board, [folder, '--check'])

    expect(clean.exitCode).toBe(0)
    expect(existsSync(join(board.root, '.run', 'captures'))).toBe(false)

    writeFileSync(join(folder, 'home/hero.html'), '<p>by hand</p>')

    const stale = await references(board, [folder, '--check'])

    expect(stale.exitCode).toBe(14)
    expect(stale.envelope.error?.code).toBe('references-stale')
  })
})
