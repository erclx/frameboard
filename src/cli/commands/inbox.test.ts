import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

describe('inbox', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    writeFileSync(
      join(board.root, 'webapp/home/notes.json'),
      JSON.stringify({
        version: 1,
        notes: [
          {
            id: 'n_0000000a',
            number: 1,
            frame: 'hero',
            anchor: null,
            text: 'Tighten the header',
            from: 'developer',
            author: null,
            session: null,
            to: 'sess-1',
            state: 'queued',
            thread: null,
            createdAt: '2026-10-19T10:00:00.000Z',
            updatedAt: '2026-10-19T10:00:00.000Z',
          },
        ],
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    board.cleanup()
  })

  it('prints the notes queued to the session in the environment', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'sess-1')

    const result = await cli(['inbox'], { cwd: board.root })

    expect(result.stdout).toMatch(
      /^frameboard note n_0000000a on webapp\/home\/hero: Tighten the header/,
    )
  })

  it('prints nothing queued to another session named by --session', async () => {
    const result = await cli(['inbox', '--session', 'other', '--json'], {
      cwd: board.root,
    })

    expect(result.json().data).toEqual({ session: 'other', notes: [] })
  })

  it('refuses a run with no session as session-required, exit 2', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '')

    const result = await cli(['inbox', '--json'], { cwd: board.root })

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('session-required')
  })
})
