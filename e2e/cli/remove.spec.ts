import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import type { RemoveResult } from '../../src/shared/records/edit'
import type { InspectResult } from '../../src/shared/records/inspect'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string; details: Record<string, unknown> }
}

test.describe('remove', () => {
  let board: FixtureBoard

  test.beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  test.afterEach(() => {
    board.cleanup()
  })

  /** Runs the built CLI on the copied board, resolving its exit code and envelope. */
  async function frameboard<T>(
    args: string[],
  ): Promise<{ exitCode: number; envelope: Envelope<T> }> {
    try {
      const { stdout } = await run('node', [
        CLI,
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

  test('removes the element inspect named, then refuses the same call again', async () => {
    const inspected = await frameboard<InspectResult>([
      'inspect',
      'webapp/home/hero',
    ])
    const heading = inspected.envelope.data?.elements.find(
      (element) => element.tag === 'h1',
    )
    if (!inspected.envelope.data || !heading) {
      throw new Error(JSON.stringify(inspected.envelope))
    }
    const args = [
      'remove',
      'webapp/home/hero',
      '--index',
      String(heading.index),
      '--hash',
      inspected.envelope.data.hash,
    ]

    const removed = await frameboard<RemoveResult>(args)

    expect(removed.exitCode).toBe(0)
    expect(removed.envelope.data?.ref).toBe('webapp/home/hero')
    const frame = join(board.root, 'webapp', 'home', 'hero.html')
    const written = readFileSync(frame, 'utf8')
    expect(written).not.toContain('<h1')

    const again = await frameboard<RemoveResult>(args)

    expect(again.exitCode).toBe(7)
    expect(again.envelope.error?.code).toBe('stale-address')
    expect(readFileSync(frame, 'utf8')).toBe(written)
  })
})
