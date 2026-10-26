import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame, resizeFrame, setMeasured } from '../board/frames'
import { addPage, deletePage, movePage, renamePage } from '../board/pages'
import { contentHash } from '../edit/address'
import {
  editFrameFile,
  insertFrameFile,
  removeFrameFile,
} from '../edit/frame-file'
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

  describe('entry on a hugging frame', () => {
    function hugHero(): void {
      const file = JSON.parse(read('webapp/home/layout.json'))
      file.frames.hero.hugHeight = true
      writeFileSync(at('webapp/home/layout.json'), JSON.stringify(file))
    }

    const measure = (height: number) =>
      setMeasured(
        board.root,
        'webapp/home',
        { hero: { width: 1440, height } },
        { cwd: board.root },
      )

    it('holds a hand move after the server measured the height', async () => {
      hugHero()
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })
      await measure(1232)

      await expect(holds(first(), 'after')).resolves.toBe(true)
    })

    it('undoes the move and keeps the measured height', async () => {
      hugHero()
      await moveFrame(board.root, 'webapp/home/hero', { ...options(), x: 40 })
      await measure(1232)

      await restore(first(), 'before')

      expect(
        JSON.parse(read('webapp/home/layout.json')).frames.hero,
      ).toMatchObject({ x: 0, height: 1232, hugHeight: true })
    })

    it('restores the height a hand resize fixed', async () => {
      hugHero()
      await resizeFrame(board.root, 'webapp/home/hero', {
        ...options(),
        height: 600,
      })

      await restore(first(), 'before')

      expect(
        JSON.parse(read('webapp/home/layout.json')).frames.hero,
      ).toMatchObject({ height: 900, hugHeight: true })
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

    it('refuses a restore once an agent wrote bytes that are not UTF-8', async () => {
      editHeadline('Welcome')
      const agent = Buffer.concat([
        readFileSync(at(HERO)),
        Buffer.from([0x3c, 0x21, 0x2d, 0x2d, 0xe9, 0x2d, 0x2d, 0x3e]),
      ])
      writeFileSync(at(HERO), agent)

      await expect(restore(first(), 'before')).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(readFileSync(at(HERO)).equals(agent)).toBe(true)
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

  describe('inserted', () => {
    const HERO = 'webapp/home/hero.html'
    const TEXT = '<p data-name="Text">Text</p>'
    /** The body and its headline, by `querySelectorAll('*')` order. */
    const BODY = 4
    const HEADLINE = 5

    /** Places a Text before the headline by hand, as the insert route does, and journals it. */
    function placeText(): void {
      const inserted = insertFrameFile(
        at(HERO),
        contentHash(readFileSync(at(HERO))),
        { parent: BODY, before: HEADLINE },
        TEXT,
      )
      if (!inserted.ok) throw new Error(inserted.detail)
      journal.inserted(at(HERO), 'webapp/home/hero', inserted.span)
    }

    it('undoes an insert byte for byte', async () => {
      const original = read(HERO)
      placeText()

      await restore(first(), 'before')

      expect(read(HERO)).toBe(original)
    })

    it('redoes it under its parent, before the sibling it went before', async () => {
      placeText()
      const placed = read(HERO)
      await restore(first(), 'before')

      await restore(first(), 'after')

      expect(read(HERO)).toBe(placed)
    })

    it('undoes it and keeps what an agent wrote elsewhere', async () => {
      placeText()
      writeFileSync(
        at(HERO),
        read(HERO).replace('</body>', '<footer>Agent</footer></body>'),
      )

      await restore(first(), 'before')

      expect(read(HERO)).not.toContain(TEXT)
      expect(read(HERO)).toContain('<footer>Agent</footer>')
    })

    it('answers the hash of the bytes it left', async () => {
      placeText()

      const hash = await restore(first(), 'before')

      expect(hash).toBe(contentHash(readFileSync(at(HERO))))
    })

    it('fails once an agent changed the inserted element', async () => {
      placeText()
      writeFileSync(at(HERO), read(HERO).replace('>Text<', '>Agent<'))

      await expect(holds(first(), 'after')).resolves.toBe(false)
    })

    it('refuses an undo once an agent changed the inserted element', async () => {
      placeText()
      const agent = read(HERO).replace('>Text<', '>Agent<')
      writeFileSync(at(HERO), agent)

      await expect(restore(first(), 'before')).rejects.toMatchObject({
        code: 'undo-overtaken',
        details: { change: 'inserted' },
      })
      expect(read(HERO)).toBe(agent)
    })
  })

  describe('removed', () => {
    const HERO = 'webapp/home/hero.html'
    /** The headline, by `querySelectorAll('*')` order. */
    const HEADLINE = 5

    /** Deletes the headline by hand, as the remove route does, and journals it. */
    function deleteHeadline(): void {
      const removed = removeFrameFile(
        at(HERO),
        contentHash(readFileSync(at(HERO))),
        HEADLINE,
      )
      if (!removed.ok) throw new Error(removed.detail)
      journal.deletedElement(at(HERO), 'webapp/home/hero', removed.span)
    }

    it('undoes a delete, putting the element back under its parent', async () => {
      deleteHeadline()

      await restore(first(), 'before')

      expect(read(HERO)).toContain('<h1 data-name="Headline">')
    })

    it('redoes it, taking the element out again', async () => {
      deleteHeadline()
      const deleted = read(HERO)
      await restore(first(), 'before')

      await restore(first(), 'after')

      expect(read(HERO)).toBe(deleted)
    })

    it('holds on each side as the delete left it', async () => {
      deleteHeadline()

      await expect(holds(first(), 'after')).resolves.toBe(true)
      await expect(holds(first(), 'before')).resolves.toBe(false)
    })

    it('refuses an undo once an agent took out the sibling it went before', async () => {
      deleteHeadline()
      const agent = read(HERO).replace(/<p data-name="Caption">.*?<\/p>/s, '')
      writeFileSync(at(HERO), agent)

      await expect(restore(first(), 'before')).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(read(HERO)).toBe(agent)
    })
  })
})
