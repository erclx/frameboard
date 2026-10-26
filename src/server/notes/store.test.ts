import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NotesFile } from '@/shared/records/notes'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  addReply,
  addRoot,
  deliveryOf,
  findNote,
  readNotes,
  setState,
  updateNotes,
} from './store'

const NOW = new Date('2026-10-19T10:00:00.000Z')
const LATER = new Date('2026-10-19T10:05:00.000Z')

function pin(file: NotesFile, id: string, to: string | null = null) {
  return addRoot(
    file,
    {
      frame: 'hero',
      anchor: null,
      text: 'Tighten the header',
      author: 'Ada',
      to,
    },
    { now: NOW, id },
  )
}

const EMPTY: NotesFile = { version: 1, notes: [] }

describe('notes store', () => {
  describe('addRoot', () => {
    it('numbers a root note one past the page highest', () => {
      const file = pin(pin(EMPTY, 'n_00000001'), 'n_00000002')

      expect(file.notes.map((note) => note.number)).toEqual([1, 2])
    })

    it('never reuses a done note number', () => {
      const done = setState(pin(EMPTY, 'n_00000001'), 'n_00000001', 'done', NOW)

      const file = pin(done, 'n_00000002')

      expect(file.notes[1]?.number).toBe(2)
    })

    it('saves a note with no session as open', () => {
      expect(pin(EMPTY, 'n_00000001').notes[0]).toMatchObject({
        state: 'open',
        to: null,
        from: 'developer',
        author: 'Ada',
        thread: null,
      })
    })

    it('queues a note sent to a session', () => {
      expect(pin(EMPTY, 'n_00000001', 'sess-1').notes[0]).toMatchObject({
        state: 'queued',
        to: 'sess-1',
      })
    })
  })

  describe('addReply', () => {
    it('threads an agent reply under the root and leaves its state', () => {
      const sent = setState(
        pin(EMPTY, 'n_00000001', 's'),
        'n_00000001',
        'delivered',
        NOW,
      )

      const file = addReply(
        sent,
        'n_00000001',
        { text: 'Done', from: 'agent', author: null, session: 's' },
        { now: LATER, id: 'n_00000002' },
      )

      expect(file.notes[1]).toMatchObject({
        thread: 'n_00000001',
        number: null,
        frame: 'hero',
        from: 'agent',
        session: 's',
      })
      expect(file.notes[0]?.state).toBe('delivered')
    })

    it('threads a reply to a reply under the same root', () => {
      const first = addReply(
        pin(EMPTY, 'n_00000001'),
        'n_00000001',
        { text: 'a', from: 'agent', author: null, session: null },
        { now: LATER, id: 'n_00000002' },
      )

      const file = addReply(
        first,
        'n_00000002',
        { text: 'b', from: 'agent', author: null, session: null },
        { now: LATER, id: 'n_00000003' },
      )

      expect(file.notes[2]?.thread).toBe('n_00000001')
    })

    it('re-queues the root to the session a developer reply hands it to', () => {
      const file = addReply(
        pin(EMPTY, 'n_00000001'),
        'n_00000001',
        {
          text: 'over to you',
          from: 'developer',
          author: 'Ada',
          session: null,
          to: 'sess-2',
        },
        { now: LATER, id: 'n_00000002' },
      )

      expect(file.notes[0]).toMatchObject({
        to: 'sess-2',
        state: 'queued',
        updatedAt: LATER.toISOString(),
      })
    })

    it('refuses an id the page does not hold', () => {
      expect(() =>
        addReply(
          EMPTY,
          'n_ffffffff',
          { text: 'x', from: 'agent', author: null, session: null },
          { now: NOW, id: 'n_00000002' },
        ),
      ).toThrow(expect.objectContaining({ code: 'note-not-found' }))
    })
  })

  describe('on disk', () => {
    let board: TempBoard

    beforeEach(() => {
      board = writeBoard({
        'webapp/project.json': '{ "version": 1, "pages": [] }\n',
        'webapp/home/hero.html': '<p>hi</p>\n',
        'webapp/settings/form.html': '<p>form</p>\n',
      })
    })

    afterEach(() => {
      board.cleanup()
    })

    it('reads a page with no notes file as empty', async () => {
      await expect(
        readNotes(join(board.root, 'webapp/home/notes.json')),
      ).resolves.toEqual({ version: 1, notes: [] })
    })

    it('finds a note on another page of the board', async () => {
      const path = join(board.root, 'webapp/settings/notes.json')
      await updateNotes(path, (file) => pin(file, 'n_0000abcd'))

      const found = await findNote(board.root, 'n_0000abcd')

      expect(found).toMatchObject({
        project: 'webapp',
        page: 'settings',
        note: { id: 'n_0000abcd' },
      })
    })

    it("reads an open thread's line with its newest developer message", async () => {
      const path = join(board.root, 'webapp/home/notes.json')
      await updateNotes(path, (file) =>
        addReply(
          pin(file, 'n_0000abcd'),
          'n_0000abcd',
          {
            text: 'Make it bolder',
            from: 'developer',
            author: 'Ada',
            session: null,
          },
          { now: LATER, id: 'n_0000beef' },
        ),
      )

      const delivery = await deliveryOf(
        board.root,
        { project: 'webapp', page: 'home', path },
        'n_0000abcd',
      )

      expect(delivery).toMatchObject({
        ref: 'webapp/home/hero',
        note: { id: 'n_0000abcd', state: 'open' },
      })
      expect(delivery.line).toContain(
        'n_0000abcd on webapp/home/hero: Make it bolder',
      )
    })

    it('refuses a reply id as the root of a delivery', async () => {
      const path = join(board.root, 'webapp/home/notes.json')
      await updateNotes(path, (file) =>
        addReply(
          pin(file, 'n_0000abcd'),
          'n_0000abcd',
          { text: 'More', from: 'developer', author: 'Ada', session: null },
          { now: LATER, id: 'n_0000beef' },
        ),
      )

      await expect(
        deliveryOf(
          board.root,
          { project: 'webapp', page: 'home', path },
          'n_0000beef',
        ),
      ).rejects.toMatchObject({ code: 'note-not-found' })
    })

    it('refuses an id no page holds as note-not-found', async () => {
      await expect(findNote(board.root, 'n_ffffffff')).rejects.toMatchObject({
        code: 'note-not-found',
      })
    })

    it('reports a note in a file that does not parse as notes-invalid', async () => {
      writeFileSync(join(board.root, 'webapp/home/notes.json'), '{ not json')

      await expect(findNote(board.root, 'n_0000abcd')).rejects.toMatchObject({
        code: 'notes-invalid',
      })
    })

    it('refuses a file that does not parse and leaves it as it was', async () => {
      const path = join(board.root, 'webapp/home/notes.json')
      writeFileSync(path, '{ not json')

      await expect(
        updateNotes(path, (file) => pin(file, 'n_00000001')),
      ).rejects.toMatchObject({ code: 'notes-invalid' })
      expect(readFileSync(path, 'utf8')).toBe('{ not json')
    })
  })
})
