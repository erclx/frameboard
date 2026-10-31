import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from '@/server/edit/address'
import { resolveAnchors } from '@/server/notes/anchor'
import { readNotes } from '@/server/notes/store'
import { EXIT_CODES } from '@/shared/errors'
import { editResultSchema } from '@/shared/records/edit'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

// In the basic board's webapp/home/hero, index 5 is the <h1>, after html,
// head, meta, title, and body.
const HEADING = '5'

describe('edit', () => {
  let board: FixtureBoard
  let frame: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    frame = join(board.root, 'webapp', 'home', 'hero.html')
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(...argv: string[]) {
    return cli(['edit', 'webapp/home/hero', ...argv, '--json'], {
      cwd: board.root,
    })
  }

  it('should write a style edit and return the edit record', async () => {
    const original = readFileSync(frame)
    const result = await run('--index', HEADING, '--style', 'color=red')

    const written = readFileSync(frame, 'utf8')
    expect(written).toContain(
      '<h1 data-name="Headline" style="color: red">hero</h1>',
    )
    expect(result.exitCode).toBe(0)
    expect(result.json()).toEqual({
      ok: true,
      data: {
        ref: 'webapp/home/hero',
        index: 5,
        hash: contentHash(written),
        from: contentHash(original),
      },
    })
    expect(editResultSchema.safeParse(result.json().data).success).toBe(true)
  })

  it('should keep a note pinned on the edited element on it', async () => {
    const page = join(board.root, 'webapp', 'home')
    const notes = join(page, 'notes.json')
    const pinned = (await readNotes(notes)).notes[0]
    if (!pinned) throw new Error('the fixture carries no note')
    writeFileSync(
      notes,
      JSON.stringify({
        version: 1,
        notes: [
          {
            ...pinned,
            frame: 'hero',
            anchor: { index: 5, hash: contentHash(readFileSync(frame)) },
          },
        ],
      }),
    )

    await run('--index', HEADING, '--style', 'color=red')

    await expect(
      resolveAnchors(page, (await readNotes(notes)).notes),
    ).resolves.toEqual({ [pinned.id]: 5 })
  })

  it('should replace the text of an element', async () => {
    await run('--index', HEADING, '--text', 'Ship it')

    expect(readFileSync(frame, 'utf8')).toContain(
      '<h1 data-name="Headline">Ship it</h1>',
    )
  })

  it('should set an attribute whose value holds an equals sign', async () => {
    await run('--index', HEADING, '--attr', 'title=a=b')

    expect(readFileSync(frame, 'utf8')).toContain(
      '<h1 data-name="Headline" title="a=b">hero</h1>',
    )
  })

  it('should take a path to the frame file', async () => {
    const result = await cli(
      ['edit', frame, '--index', HEADING, '--text', 'Path', '--json'],
      { cwd: board.root },
    )

    expect(result.exitCode).toBe(0)
    expect(readFileSync(frame, 'utf8')).toContain(
      '<h1 data-name="Headline">Path</h1>',
    )
  })

  it('should write when the given hash matches the file', async () => {
    const hash = contentHash(readFileSync(frame))

    const result = await run('--index', HEADING, '--hash', hash, '--text', 'x')

    expect(result.exitCode).toBe(0)
  })

  it('should refuse a stale hash with its code and exit, writing nothing', async () => {
    const before = readFileSync(frame, 'utf8')

    const result = await run(
      '--index',
      HEADING,
      '--hash',
      contentHash('other'),
      '--text',
      'New',
    )

    expect(result.exitCode).toBe(EXIT_CODES['stale-address'])
    expect(result.json()).toMatchObject({
      ok: false,
      error: {
        code: 'stale-address',
        details: { ref: 'webapp/home/hero', index: 5 },
      },
    })
    expect(readFileSync(frame, 'utf8')).toBe(before)
  })

  it('should refuse a writer guard with its code and exit, writing nothing', async () => {
    writeFileSync(frame, '<table><tr><td>a</td></tr></table>')

    const result = await run('--index', '3', '--attr', 'id=x')

    expect(result.exitCode).toBe(EXIT_CODES['address-mismatch'])
    expect(result.json().error?.code).toBe('address-mismatch')
    expect(readFileSync(frame, 'utf8')).toBe(
      '<table><tr><td>a</td></tr></table>',
    )
  })

  it('should refuse a frame that does not exist', async () => {
    const result = await cli(
      ['edit', 'webapp/home/nope', '--index', '0', '--text', 'x', '--json'],
      { cwd: board.root },
    )

    expect(result.exitCode).toBe(EXIT_CODES['frame-not-found'])
  })

  it('should refuse no change as a usage error', async () => {
    const result = await run('--index', HEADING)

    expect(result.exitCode).toBe(EXIT_CODES.usage)
    expect(result.json().error?.code).toBe('usage')
  })

  it('should refuse two changes as a usage error', async () => {
    const result = await run('--index', HEADING, '--text', 'a', '--attr', 'b=c')

    expect(result.exitCode).toBe(EXIT_CODES.usage)
  })

  it('should refuse a pair with no name as a usage error', async () => {
    const result = await run('--index', HEADING, '--style', '=red')

    expect(result.exitCode).toBe(EXIT_CODES.usage)
  })

  it('should refuse a missing index as a usage error', async () => {
    const result = await run('--text', 'New')

    expect(result.exitCode).toBe(EXIT_CODES.usage)
  })

  it('should refuse a malformed hash as a usage error', async () => {
    const result = await run('--index', HEADING, '--hash', 'abc', '--text', 'x')

    expect(result.exitCode).toBe(EXIT_CODES.usage)
  })

  it('should print a human line without --json', async () => {
    const result = await cli(
      ['edit', 'webapp/home/hero', '--index', HEADING, '--text', 'Hi'],
      { cwd: board.root },
    )

    expect(result.stdout).toMatch(/^Edited element 5 of webapp\/home\/hero/)
  })
})
