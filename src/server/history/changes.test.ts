import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame } from '../board/frames'
import { addPage, deletePage, movePage, renamePage } from '../board/pages'
import { contentHash } from '../edit/address'
import { editFrameFile } from '../edit/frame-file'
import { type Change, holds, restore, StepJournal } from './changes'

describe('changes', () => {
  let board: FixtureBoard
  let journal: StepJournal

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    journal = new StepJournal(board.root, 1)
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)
  const read = (path: string) => readFileSync(at(path), 'utf8')
  const options = () => ({ cwd: board.root, journal })

  function first(): Change {
    const [change] = journal.changes
    if (!change) throw new Error('The verb reported no change.')
    return change
  }

  describe('entry', () => {
    it('holds while the entry is as the step left it', async () => {
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('holds when another frame on the page changed since', async () => {
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })
      await moveFrame(board.root, 'webapp/home/about', {
        cwd: board.root,
        x: 9,
      })

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('fails once an agent moved the same frame', async () => {
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })
      await moveFrame(board.root, 'webapp/home/hero', {
        cwd: board.root,
        x: 80,
      })

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('restores the entry and leaves the other frames', async () => {
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })
      await moveFrame(board.root, 'webapp/home/about', {
        cwd: board.root,
        x: 9,
      })

      await restore(first(), 'before')

      const frames = JSON.parse(read('webapp/home/layout.json')).frames
      expect(frames.hero.x).toBe(0)
      expect(frames.about.x).toBe(9)
    })
  })

  describe('pages', () => {
    it('fails once the order was written by hand', async () => {
      await movePage(board.root, 'webapp/home', { ...options(), index: 0 })
      writeFileSync(
        at('webapp/project.json'),
        JSON.stringify({ version: 1, pages: ['settings', 'home'] }),
      )

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('restores the order it held', async () => {
      await movePage(board.root, 'webapp/home', { ...options(), index: 0 })

      await restore(first(), 'before')

      expect(JSON.parse(read('webapp/project.json')).pages).toEqual([
        'settings',
        'home',
      ])
    })
  })

  describe('moved', () => {
    it('holds a case-only rename', async () => {
      await renamePage(board.root, 'webapp/home', 'Home', options())

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('fails when something took the old name since', async () => {
      await renamePage(board.root, 'webapp/home', 'start', options())
      mkdirSync(at('webapp/home'))

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })
  })

  describe('path', () => {
    it('holds a created page while nothing was written into it', async () => {
      await addPage(board.root, 'webapp/billing', options())

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('fails once a frame was written into a created page', async () => {
      await addPage(board.root, 'webapp/billing', options())
      writeFileSync(at('webapp/billing/plan.html'), '<p>plan</p>')

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('fails once a note was pinned on a created page', async () => {
      await addPage(board.root, 'webapp/billing', options())
      writeFileSync(at('webapp/billing/notes.json'), '{}')

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('brings a removed page back with its notes byte for byte', async () => {
      const notes = read('webapp/home/notes.json')
      await deletePage(board.root, 'webapp/home', options())

      await restore(first(), 'before')

      expect(read('webapp/home/notes.json')).toBe(notes)
    })

    it('holds a page brought back for redo only while it is unchanged', async () => {
      await deletePage(board.root, 'webapp/home', options())
      await restore(first(), 'before')
      writeFileSync(at('webapp/home/hero.html'), '<p>changed</p>')

      await expect(holds(first(), 'before')).resolves.toBe(false)
    })
  })

  describe('element', () => {
    const HERO = 'webapp/home/hero.html'

    /** Sets the headline's text by hand, as the edit route does, and journals the edited element. */
    function editHeadline(text: string): void {
      const edited = editFrameFile(
        at(HERO),
        { index: 5 },
        { kind: 'text', value: text },
      )
      if (!edited.ok) throw new Error(edited.detail)
      journal.element(at(HERO), 'webapp/home/hero', edited.span)
    }

    it('undoes a hand edit byte for byte', async () => {
      const original = read(HERO)
      editHeadline('Welcome')

      await restore(first(), 'before')

      expect(read(HERO)).toBe(original)
    })

    it('answers the hash of the bytes it left', async () => {
      editHeadline('Welcome')

      const hash = await restore(first(), 'before')

      expect(hash).toBe(contentHash(readFileSync(at(HERO))))
    })

    it('holds when an agent wrote another element since', async () => {
      editHeadline('Welcome')
      writeFileSync(
        at(HERO),
        read(HERO).replace('data-name="Caption"', 'data-name="Byline"'),
      )

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('restores the element and keeps what the agent wrote elsewhere', async () => {
      editHeadline('Welcome')
      writeFileSync(
        at(HERO),
        read(HERO).replace('data-name="Caption"', 'data-name="Byline"'),
      )

      await restore(first(), 'before')

      expect(read(HERO)).toContain('<h1 data-name="Headline">hero</h1>')
      expect(read(HERO)).toContain('data-name="Byline"')
    })

    it('fails once an agent changed the edited element', async () => {
      editHeadline('Welcome')
      writeFileSync(at(HERO), read(HERO).replace('Welcome', 'Hello'))

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('refuses a restore once an agent changed the edited element', async () => {
      editHeadline('Welcome')
      const agent = read(HERO).replace('Welcome', 'Hello')
      writeFileSync(at(HERO), agent)

      await expect(restore(first(), 'before')).rejects.toMatchObject({
        code: 'undo-overtaken',
        details: { change: 'element' },
      })
      expect(read(HERO)).toBe(agent)
    })

    it('fails once the frame was removed', async () => {
      editHeadline('Welcome')
      rmSync(at(HERO))

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('keeps the index an undo found the element at', async () => {
      editHeadline('Welcome')
      writeFileSync(
        at(HERO),
        read(HERO).replace('<h1', '<hr data-name="Rule" />\n    <h1'),
      )

      await restore(first(), 'before')

      expect(first()).toMatchObject({ span: { index: 6, count: 9 } })
    })

    it('redoes the edit on the element an undo found moved', async () => {
      editHeadline('Welcome')
      writeFileSync(
        at(HERO),
        read(HERO).replace('<h1', '<hr data-name="Rule" />\n    <h1'),
      )
      await restore(first(), 'before')

      await restore(first(), 'after')

      expect(read(HERO)).toContain(
        '<hr data-name="Rule" />\n    <h1 data-name="Headline">Welcome</h1>',
      )
    })
  })
})
