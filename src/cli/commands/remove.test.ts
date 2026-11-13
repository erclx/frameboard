import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from '@/server/edit/address'
import { resolveAnchors } from '@/server/notes/anchor'
import { readNotes } from '@/server/notes/store'
import { removeResultSchema } from '@/shared/records/edit'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

// In the basic board's webapp/home/hero, index 4 is the <body>, 5 the <h1>,
// 6 the <p>, and 7 the <code> inside it.
const BODY = '4'
const HEADING = '5'
const CAPTION = '6'

describe('remove', () => {
  let board: FixtureBoard
  let frame: string
  let original: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    frame = join(board.root, 'webapp', 'home', 'hero.html')
    original = readFileSync(frame, 'utf8')
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(...argv: string[]) {
    return cli(['remove', 'webapp/home/hero', ...argv, '--json'], {
      cwd: board.root,
    })
  }

  /** Pins the fixture's first note on `index` of the hero frame as it stands. */
  async function pinNote(index: number): Promise<string> {
    const notes = join(board.root, 'webapp', 'home', 'notes.json')
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
            anchor: { index, hash: contentHash(original) },
          },
        ],
      }),
    )
    return pinned.id
  }

  async function anchors() {
    const page = join(board.root, 'webapp', 'home')
    return resolveAnchors(
      page,
      (await readNotes(join(page, 'notes.json'))).notes,
    )
  }

  it('takes the element out of the file and returns the remove record', async () => {
    const result = await run(
      '--index',
      HEADING,
      '--hash',
      contentHash(original),
    )

    const written = readFileSync(frame, 'utf8')
    expect(written).not.toContain('<h1')
    expect(written).toContain('<p data-name="Caption">')
    expect(result.exitCode).toBe(0)
    expect(result.json()).toEqual({
      ok: true,
      data: { ref: 'webapp/home/hero', hash: contentHash(written) },
    })
    expect(removeResultSchema.safeParse(result.json().data).success).toBe(true)
  })

  it('takes the subtree out with its element', async () => {
    await run('--index', CAPTION, '--hash', contentHash(original))

    const written = readFileSync(frame, 'utf8')
    expect(written).not.toContain('<p')
    expect(written).not.toContain('<code')
    expect(written).toContain('<h1 data-name="Headline">hero</h1>')
  })

  it('refuses a stale hash with exit 7 and writes nothing', async () => {
    const result = await run('--index', HEADING, '--hash', 'a'.repeat(64))

    expect(result.exitCode).toBe(7)
    expect(result.json().error?.code).toBe('stale-address')
    expect(readFileSync(frame, 'utf8')).toBe(original)
  })

  it('refuses an index past the last element with exit 7 and writes nothing', async () => {
    const result = await run('--index', '99', '--hash', contentHash(original))

    expect(result.exitCode).toBe(7)
    expect(result.json().error?.code).toBe('invalid-address')
    expect(readFileSync(frame, 'utf8')).toBe(original)
  })

  it('refuses the body element with exit 7 and writes nothing', async () => {
    const result = await run('--index', BODY, '--hash', contentHash(original))

    expect(result.exitCode).toBe(7)
    expect(result.json().error?.code).toBe('invalid-address')
    expect(readFileSync(frame, 'utf8')).toBe(original)
  })

  it('refuses a run with no hash as a usage error and writes nothing', async () => {
    const result = await run('--index', HEADING)

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
    expect(readFileSync(frame, 'utf8')).toBe(original)
  })

  it('leaves a note pinned on the removed element falling back to the frame', async () => {
    const id = await pinNote(5)

    await run('--index', HEADING, '--hash', contentHash(original))

    await expect(anchors()).resolves.toEqual({ [id]: null })
  })

  it('carries a note pinned after the removed element to its new index', async () => {
    const id = await pinNote(6)

    await run('--index', HEADING, '--hash', contentHash(original))

    await expect(anchors()).resolves.toEqual({ [id]: 5 })
  })
})
