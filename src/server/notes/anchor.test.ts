import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Note } from '@/shared/records/notes'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { anchorFor, resolveAnchors } from './anchor'

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
