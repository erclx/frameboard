import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note } from '@/shared/records/notes'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

function note(fields: Partial<Note> & Pick<Note, 'id'>): Note {
  return {
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'Tighten the header',
    from: 'developer',
    author: 'Ada',
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    ...fields,
  }
}

describe('notes', () => {
  let board: FixtureBoard
  let home: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    home = join(board.root, 'webapp/home/notes.json')
    // The server is never started, so each verb has to work without one.
    writeFileSync(
      home,
      JSON.stringify({
        version: 1,
        notes: [
          note({ id: 'n_0000000a' }),
          note({ id: 'n_0000000b', number: 2, state: 'done' }),
          note({
            id: 'n_0000000c',
            number: null,
            thread: 'n_0000000a',
            from: 'agent',
            author: null,
          }),
        ],
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    board.cleanup()
  })

  const run = (...argv: string[]) =>
    cli([...argv, '--json'], { cwd: board.root })

  function onDisk(): Note[] {
    return JSON.parse(readFileSync(home, 'utf8')).notes
  }

  it('lists the open threads with their frame refs', async () => {
    const result = await run('notes')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      notes: [
        { id: 'n_0000000a', ref: 'webapp/home/hero', element: null },
        { id: 'n_0000000c', thread: 'n_0000000a' },
      ],
    })
  })

  it('lists the done threads too under --all', async () => {
    const result = await run('notes', '--all')

    expect(
      (result.json().data as { notes: Note[] }).notes.map((n) => n.id),
    ).toContain('n_0000000b')
  })

  it('lists nothing for a page holding no notes', async () => {
    const result = await run('notes', '--page', 'webapp/settings')

    expect(result.json().data).toEqual({ notes: [] })
  })

  it('reply threads an agent reply signed with the session', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'sess-1')

    const result = await run('notes', 'reply', 'n_0000000a', 'Done, tightened')

    expect(result.exitCode).toBe(0)
    expect(onDisk().at(-1)).toMatchObject({
      text: 'Done, tightened',
      from: 'agent',
      session: 'sess-1',
      thread: 'n_0000000a',
    })
  })

  it('reply takes --json and --root from outside the board', async () => {
    const result = await cli(
      [
        'notes',
        'reply',
        'n_0000000a',
        'From afar',
        '--root',
        board.root,
        '--json',
      ],
      { cwd: tmpdir() },
    )

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      note: { text: 'From afar', thread: 'n_0000000a' },
    })
  })

  it('reply signs no session outside Claude Code', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '')

    await run('notes', 'reply', 'n_0000000a', 'ok')

    expect(onDisk().at(-1)?.session).toBeNull()
  })

  it('done closes the thread a reply id belongs to', async () => {
    const result = await run('notes', 'done', 'n_0000000c')

    expect(result.exitCode).toBe(0)
    expect(onDisk()[0]).toMatchObject({ id: 'n_0000000a', state: 'done' })
  })

  it.each([
    ['reply', ['n_0000000a', 'On it']],
    ['done', ['n_0000000a']],
  ])('%s takes --project naming the note’s project', async (verb, args) => {
    const result = await run('notes', verb, ...args, '--project', 'webapp')

    expect(result.exitCode).toBe(0)
  })

  it.each([
    ['reply', ['n_0000000a', 'On it']],
    ['done', ['n_0000000a']],
  ])(
    '%s refuses note-not-found when the id sits in another project, writing nothing',
    async (verb, args) => {
      const before = onDisk()

      const result = await run('notes', verb, ...args, '--project', 'marketing')

      expect(result.exitCode).toBe(3)
      expect(result.json().error?.code).toBe('note-not-found')
      expect(onDisk()).toEqual(before)
    },
  )

  it('refuses a missing id as note-not-found, exit 3', async () => {
    const result = await run('notes', 'reply', 'n_ffffffff', 'x')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('note-not-found')
  })

  it('refuses a notes file that does not parse as notes-invalid, exit 5', async () => {
    writeFileSync(home, '{ not json')

    const result = await run('notes', '--page', 'webapp/home')

    expect(result.exitCode).toBe(5)
    expect(result.json().error?.code).toBe('notes-invalid')
  })
})
