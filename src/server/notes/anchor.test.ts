import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Note } from '@/shared/records/notes'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { contentHash } from '../edit/address'
import {
  editFrameFile,
  insertFrameFile,
  moveFrameFile,
  removeFrameFile,
} from '../edit/frame-file'
import { anchorFor, indexAt, resolveAnchors } from './anchor'
import { followEdit, readNotes } from './store'

const FRAME =
  '<!doctype html><html><head></head><body><h1>Hi</h1><p>x</p></body></html>\n'

function note(id: string, anchor: Note['anchor']): Note {
  return {
    id,
    number: 1,
    frame: 'hero',
    anchor,
    text: 'x',
    from: 'developer',
    author: null,
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  }
}

describe('note anchors', () => {
  let board: TempBoard
  let page: string
  let frame: string

  beforeEach(() => {
    board = writeBoard({ 'webapp/home/hero.html': FRAME })
    page = join(board.root, 'webapp/home')
    frame = join(page, 'hero.html')
  })

  afterEach(() => {
    board.cleanup()
  })

  function renderedAt(): string {
    return new Date(statSync(frame).mtimeMs).toISOString()
  }

  it('anchors an element of the frame the board rendered', async () => {
    const anchor = await anchorFor(frame, 3, renderedAt())

    expect(anchor).toEqual({
      index: 3,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('refuses a pick made before the file changed as stale-address', async () => {
    await expect(
      anchorFor(frame, 3, '2000-01-01T00:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'stale-address' })
  })

  it('refuses an index past the frame elements as stale-address', async () => {
    await expect(anchorFor(frame, 6, renderedAt())).rejects.toMatchObject({
      code: 'stale-address',
    })
  })

  it('resolves an element note to its index while the hash matches', async () => {
    const anchor = await anchorFor(frame, 3, renderedAt())

    await expect(resolveAnchors(page, [note('n_1', anchor)])).resolves.toEqual({
      n_1: 3,
    })
  })

  it('falls back to the frame once the file changed', async () => {
    const anchor = await anchorFor(frame, 3, renderedAt())
    writeFileSync(frame, FRAME.replace('Hi', 'Hello'))

    await expect(resolveAnchors(page, [note('n_1', anchor)])).resolves.toEqual({
      n_1: null,
    })
  })

  it('falls back to the frame once the file is gone', async () => {
    await expect(
      resolveAnchors(join(board.root, 'webapp/home'), [
        { ...note('n_1', { index: 1, hash: 'a' }), frame: 'gone' },
      ]),
    ).resolves.toEqual({ n_1: null })
  })

  it('leaves a frame note out', async () => {
    await expect(resolveAnchors(page, [note('n_1', null)])).resolves.toEqual({})
  })
})

describe('a note followed through a board write', () => {
  let board: TempBoard
  let page: string
  let frame: string
  let notes: string

  beforeEach(() => {
    board = writeBoard({ 'webapp/home/hero.html': FRAME })
    page = join(board.root, 'webapp/home')
    frame = join(page, 'hero.html')
    notes = join(page, 'notes.json')
    // Pinned on the h1, at index 3 of the frame as written.
    writeFileSync(
      notes,
      JSON.stringify({
        version: 1,
        notes: [note('n_1', { index: 3, hash: contentHash(FRAME) })],
      }),
    )
  })

  afterEach(() => {
    board.cleanup()
  })

  async function resolved(): Promise<Record<string, number | null>> {
    return resolveAnchors(page, (await readNotes(notes)).notes)
  }

  it('keeps the note on its element through a style edit', async () => {
    const edit = editFrameFile(
      frame,
      { index: 3, hash: contentHash(FRAME) },
      { kind: 'style', property: 'color', value: 'red' },
    )
    if (!edit.ok) throw new Error(edit.detail)

    await followEdit(notes, 'hero', edit.from, edit.hash, edit.remap)

    await expect(resolved()).resolves.toEqual({ n_1: 3 })
  })

  it('follows its element past an insert before it', async () => {
    const insert = insertFrameFile(
      frame,
      contentHash(FRAME),
      { parent: 2, before: 3 },
      '<p>New</p>',
    )
    if (!insert.ok) throw new Error(insert.detail)

    await followEdit(
      notes,
      'hero',
      contentHash(FRAME),
      insert.hash,
      insert.remap,
    )

    await expect(resolved()).resolves.toEqual({ n_1: 4 })
  })

  it('follows its element through a move', async () => {
    const move = moveFrameFile(frame, contentHash(FRAME), 3, {
      parent: 2,
      before: null,
    })
    if (!move.ok) throw new Error(move.detail)

    await followEdit(notes, 'hero', contentHash(FRAME), move.hash, move.remap)

    await expect(resolved()).resolves.toEqual({ n_1: 4 })
  })

  it('falls back to the frame once its element is removed', async () => {
    const remove = removeFrameFile(frame, contentHash(FRAME), 3)
    if (!remove.ok) throw new Error(remove.detail)

    await followEdit(
      notes,
      'hero',
      contentHash(FRAME),
      remove.hash,
      remove.remap,
    )

    await expect(resolved()).resolves.toEqual({ n_1: null })
  })

  it('finds its element again on an undo and a redo', async () => {
    const insert = insertFrameFile(
      frame,
      contentHash(FRAME),
      { parent: 2, before: 3 },
      '<p>New</p>',
    )
    if (!insert.ok) throw new Error(insert.detail)
    await followEdit(
      notes,
      'hero',
      contentHash(FRAME),
      insert.hash,
      insert.remap,
    )
    const inserted = readFileSync(frame, 'utf8')

    writeFileSync(frame, FRAME)
    const undone = await resolved()
    writeFileSync(frame, inserted)
    const redone = await resolved()

    expect([undone, redone]).toEqual([{ n_1: 3 }, { n_1: 4 }])
  })

  it('falls back to the frame on a rewrite from outside the board', async () => {
    const insert = insertFrameFile(
      frame,
      contentHash(FRAME),
      { parent: 2, before: 3 },
      '<p>New</p>',
    )
    if (!insert.ok) throw new Error(insert.detail)
    await followEdit(
      notes,
      'hero',
      contentHash(FRAME),
      insert.hash,
      insert.remap,
    )

    writeFileSync(frame, FRAME.replace('Hi', 'Hello'))

    await expect(resolved()).resolves.toEqual({ n_1: null })
  })

  it('leaves a note on another frame as it is', async () => {
    const before = readFileSync(notes, 'utf8')

    await followEdit(
      notes,
      'other',
      contentHash(FRAME),
      'a'.repeat(64),
      (i) => i,
    )

    expect(readFileSync(notes, 'utf8')).toBe(before)
  })

  it('keeps the last 100 hashes a note followed', async () => {
    const hashes = Array.from({ length: 101 }, (_, at) => `h${at + 1}`)
    const chain = [contentHash(FRAME), ...hashes]
    for (const [at, after] of hashes.entries()) {
      await followEdit(notes, 'hero', chain[at] ?? '', after, (i) => i)
    }

    const [pinned] = (await readNotes(notes)).notes
    if (!pinned?.anchor) throw new Error('the note lost its anchor')
    expect([
      indexAt(pinned.anchor, 'h1'),
      indexAt(pinned.anchor, 'h101'),
    ]).toEqual([null, 3])
  })
})
