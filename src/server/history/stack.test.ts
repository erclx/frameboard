import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame } from '../board/frames'
import { addPage, movePage, renamePage } from '../board/pages'
import { renameProject } from '../board/projects'
import { contentHash } from '../edit/address'
import { editFrameFile } from '../edit/frame-file'
import { History, HISTORY_CAP, type HistoryCounts, type Step } from './stack'

describe('History', () => {
  let board: FixtureBoard
  let history: History
  let told: HistoryCounts[]

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    told = []
    history = new History(board.root, (counts) => told.push(counts))
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)
  const pageOrder = () =>
    JSON.parse(readFileSync(at('webapp/project.json'), 'utf8')).pages
  const heroX = () =>
    JSON.parse(readFileSync(at('webapp/home/layout.json'), 'utf8')).frames.hero
      .x

  async function moveHero(x: number): Promise<void> {
    const journal = history.journal()
    await moveFrame(board.root, 'webapp/home/hero', {
      cwd: board.root,
      x,
      journal,
    })
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: ['webapp/home/hero'],
    })
  }

  async function renameHome(to: string): Promise<void> {
    const journal = history.journal()
    await renamePage(board.root, 'webapp/home', to, {
      cwd: board.root,
      journal,
    })
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: { before: 'webapp/home', after: `webapp/${to}` },
      frames: [],
    })
  }

  it('undoes a step and answers the page to show', async () => {
    await renameHome('start')

    const answer = await history.undo()

    expect(answer).toEqual({ page: 'webapp/home', frames: [] })
    expect(existsSync(at('webapp/home'))).toBe(true)
    expect(pageOrder()).toEqual(['settings', 'home'])
  })

  async function editHeadline(text: string): Promise<void> {
    const edited = editFrameFile(
      at('webapp/home/hero.html'),
      { index: 5 },
      { kind: 'text', value: text },
    )
    if (!edited.ok) throw new Error(edited.detail)
    const journal = history.journal()
    journal.element(
      at('webapp/home/hero.html'),
      'webapp/home/hero',
      edited.span,
    )
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: ['webapp/home/hero'],
    })
  }

  it('answers the hash an undone hand edit left its frame at', async () => {
    const original = contentHash(readFileSync(at('webapp/home/hero.html')))
    await editHeadline('Welcome')

    const answer = await history.undo()

    expect(answer.hashes).toEqual({ 'webapp/home/hero': original })
  })

  it('answers the edited hash on redo', async () => {
    await editHeadline('Welcome')
    const edited = contentHash(readFileSync(at('webapp/home/hero.html')))
    await history.undo()

    const answer = await history.redo()

    expect(answer.hashes).toEqual({ 'webapp/home/hero': edited })
  })

  it('refuses an undo of a hand edit once an agent wrote the frame', async () => {
    await editHeadline('Welcome')
    writeFileSync(at('webapp/home/hero.html'), '<p>agent</p>')

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
    })
    expect(readFileSync(at('webapp/home/hero.html'), 'utf8')).toBe(
      '<p>agent</p>',
    )
  })

  it('undoes a hand edit after an agent wrote another element, answering the hash on disk', async () => {
    await editHeadline('Welcome')
    const hero = at('webapp/home/hero.html')
    writeFileSync(
      hero,
      readFileSync(hero, 'utf8').replace(
        'data-name="Caption"',
        'title="agent" data-name="Caption"',
      ),
    )

    const answer = await history.undo()

    expect(readFileSync(hero, 'utf8')).toContain(
      '<h1 data-name="Headline">hero</h1>',
    )
    expect(readFileSync(hero, 'utf8')).toContain('title="agent"')
    expect(answer.hashes).toEqual({
      'webapp/home/hero': contentHash(readFileSync(hero)),
    })
  })

  it('refuses an undo of an element an agent changed since', async () => {
    await editHeadline('Welcome')
    const hero = at('webapp/home/hero.html')
    const agent = readFileSync(hero, 'utf8').replace('Welcome', 'Hello')
    writeFileSync(hero, agent)

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
      details: { change: 'element' },
    })
    expect(readFileSync(hero, 'utf8')).toBe(agent)
  })

  it('redoes an undone step', async () => {
    await renameHome('start')
    await history.undo()

    const answer = await history.redo()

    expect(answer.page).toBe('webapp/start')
    expect(pageOrder()).toEqual(['settings', 'start'])
  })

  it('tells the counts after each change to the stacks', async () => {
    await moveHero(40)
    await history.undo()

    expect(told).toEqual([
      { undo: 1, redo: 0 },
      { undo: 0, redo: 1 },
    ])
  })

  it('refuses nothing-to-undo on an empty stack', async () => {
    await expect(history.undo()).rejects.toMatchObject({
      code: 'nothing-to-undo',
    })
  })

  it('records nothing for a write that changed nothing', async () => {
    const journal = history.journal()
    await movePage(board.root, 'webapp/home', {
      cwd: board.root,
      index: 1,
      journal,
    })

    history.record({ id: journal.id, changes: [], page: null, frames: [] })

    expect(history.counts()).toEqual({ undo: 0, redo: 0 })
  })

  it('refuses and drops a step an agent overtook', async () => {
    await moveHero(40)
    await moveFrame(board.root, 'webapp/home/hero', { cwd: board.root, x: 80 })

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
      message: expect.stringContaining('changed hero after your edit'),
    })
    expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    expect(heroX()).toBe(80)
  })

  it('drops a step whose layout an agent left unreadable', async () => {
    await moveHero(40)
    writeFileSync(at('webapp/home/layout.json'), '{ not json')

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
    })
    expect(history.counts()).toEqual({ undo: 0, redo: 0 })
  })

  it('checks the whole step before writing any of it', async () => {
    await renameHome('start')
    // The order still holds, but the old name is taken, so neither is written.
    writeFileSync(at('webapp/home'), '')

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
    })
    expect(pageOrder()).toEqual(['settings', 'start'])
  })

  it('lets a rename undo through when an agent drew into the page', async () => {
    await renameHome('start')
    writeFileSync(at('webapp/start/extra.html'), '<p>agent</p>')

    await history.undo()

    expect(existsSync(at('webapp/home/extra.html'))).toBe(true)
    expect(pageOrder()).toEqual(['settings', 'home'])
  })

  it('refuses a rename undo once an agent added a page', async () => {
    await renameHome('start')
    await addPage(board.root, 'webapp/billing', { cwd: board.root })

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
    })
    expect(existsSync(at('webapp/start'))).toBe(true)
  })

  it('clears redo on a new record', async () => {
    await moveHero(40)
    await history.undo()

    await moveHero(60)

    expect(history.counts()).toEqual({ undo: 1, redo: 0 })
  })

  it('keeps the newest steps up to the cap', async () => {
    for (let x = 1; x <= HISTORY_CAP + 1; x++) await moveHero(x)

    expect(history.counts().undo).toBe(HISTORY_CAP)
  })

  describe('onWrite', () => {
    let wrote: Step[]

    beforeEach(() => {
      wrote = []
      history = new History(board.root, undefined, (step) => wrote.push(step))
    })

    it('tells the step a record pushed', async () => {
      await moveHero(40)

      expect(wrote.map((step) => step.frames)).toEqual([['webapp/home/hero']])
    })

    it('tells the step an undo and a redo wrote', async () => {
      await renameHome('start')
      wrote = []

      await history.undo()
      await history.redo()

      expect(wrote.map((step) => step.page)).toEqual([
        { before: 'webapp/home', after: 'webapp/start' },
        { before: 'webapp/home', after: 'webapp/start' },
      ])
    })

    it('tells nothing for a step that recorded nothing', () => {
      history.record({ id: 1, changes: [], page: null, frames: ['x/y/z'] })

      expect(wrote).toEqual([])
    })

    it('tells nothing for an undo an agent overtook', async () => {
      await moveHero(40)
      wrote = []
      await moveFrame(board.root, 'webapp/home/hero', {
        cwd: board.root,
        x: 80,
      })

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(wrote).toEqual([])
    })
  })

  describe('peek', () => {
    it('names the frames of the top undo step', async () => {
      await moveHero(40)

      expect(history.peek('undo')).toEqual(['webapp/home/hero'])
    })

    it('names the page a rename moved, on both sides', async () => {
      await renameHome('start')

      expect(history.peek('undo')).toEqual(
        expect.arrayContaining(['webapp/home', 'webapp/start']),
      )
    })

    it('names the project a project rename moved, on both sides', async () => {
      const journal = history.journal()
      await renameProject(board.root, 'webapp', 'site', { journal })
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [],
      })

      expect(history.peek('undo')).toEqual(
        expect.arrayContaining(['webapp', 'site']),
      )
    })

    it('names the top redo step once it is undone', async () => {
      await moveHero(40)
      await history.undo()

      expect(history.peek('redo')).toEqual(['webapp/home/hero'])
    })

    it('names nothing on an empty stack', () => {
      expect(history.peek('undo')).toEqual([])
    })

    it('leaves both stacks as they were', async () => {
      await moveHero(40)

      history.peek('undo')

      expect(history.counts()).toEqual({ undo: 1, redo: 0 })
    })
  })

  it('runs quick undos in order', async () => {
    await moveHero(40)
    await moveHero(60)

    await Promise.all([history.undo(), history.undo()])

    expect(heroX()).toBe(0)
    expect(history.counts()).toEqual({ undo: 0, redo: 2 })
  })
})
