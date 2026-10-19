import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame } from '../board/frames'
import { addPage, movePage, renamePage } from '../board/pages'
import { History, HISTORY_CAP, type HistoryCounts } from './stack'

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

  it('runs quick undos in order', async () => {
    await moveHero(40)
    await moveHero(60)

    await Promise.all([history.undo(), history.undo()])

    expect(heroX()).toBe(0)
    expect(history.counts()).toEqual({ undo: 0, redo: 2 })
  })
})
