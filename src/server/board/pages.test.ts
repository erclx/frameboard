import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
} from './pages'

describe('pages', () => {
  let board: FixtureBoard
  let cwd: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    cwd = board.root
  })

  afterEach(() => {
    board.cleanup()
  })

  function pageOrder(): string[] {
    return JSON.parse(
      readFileSync(join(board.root, 'webapp/project.json'), 'utf8'),
    ).pages
  }

  describe('addPage', () => {
    it('creates the folder at the end of the order by default', async () => {
      const page = await addPage(board.root, 'webapp/billing', { cwd })

      expect(page).toMatchObject({
        ref: 'webapp/billing',
        index: 2,
        frames: [],
      })
      expect(pageOrder()).toEqual(['settings', 'home', 'billing'])
    })

    it('inserts at --index', async () => {
      await addPage(board.root, 'webapp/billing', { cwd, index: 0 })

      expect(pageOrder()).toEqual(['billing', 'settings', 'home'])
    })

    it('fails name-taken on a page held in another case', async () => {
      await expect(
        addPage(board.root, 'webapp/Home', { cwd }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })

    it('refuses on an invalid project.json and creates no folder', async () => {
      const broken = copyFixtureBoard('broken')
      try {
        await expect(
          addPage(broken.root, 'wrecked/extra', { cwd: broken.root }),
        ).rejects.toMatchObject({ code: 'project-file-invalid', exitCode: 5 })
        expect(existsSync(join(broken.root, 'wrecked/extra'))).toBe(false)
      } finally {
        broken.cleanup()
      }
    })
  })

  describe('duplicatePage', () => {
    it('copies the folder without notes.json beside the source', async () => {
      writeFileSync(join(board.root, 'webapp/home/notes.json'), '{}')

      const page = await duplicatePage(board.root, 'webapp/home', { cwd })

      expect(page.ref).toBe('webapp/home-2')
      expect(readdirSync(join(board.root, 'webapp/home-2')).sort()).toEqual([
        'about.html',
        'hero.html',
        'layout.json',
      ])
      expect(pageOrder()).toEqual(['settings', 'home', 'home-2'])
    })

    it('fails name-taken when --name is the source itself', async () => {
      await expect(
        duplicatePage(board.root, 'webapp/home', { cwd, name: 'home' }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })
  })

  describe('renamePage', () => {
    it('renames the folder in place in the order', async () => {
      await renamePage(board.root, 'webapp/settings', 'account', { cwd })

      expect(pageOrder()).toEqual(['account', 'home'])
    })

    it('fails name-taken on another page name', async () => {
      await expect(
        renamePage(board.root, 'webapp/settings', 'HOME', { cwd }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })
  })

  describe('movePage', () => {
    it('clamps an index past the end', async () => {
      const page = await movePage(board.root, 'webapp/settings', {
        cwd,
        index: 9,
      })

      expect(page.index).toBe(1)
      expect(pageOrder()).toEqual(['home', 'settings'])
    })
  })

  describe('deletePage', () => {
    it('removes the folder and its place in the order', async () => {
      expect(await deletePage(board.root, 'webapp/home', { cwd })).toEqual({
        deleted: 'webapp/home',
      })
      expect(pageOrder()).toEqual(['settings'])
    })
  })

  describe('with a journal', () => {
    it('add reports the folder it created and the new order', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await addPage(board.root, 'webapp/billing', { cwd, journal })

      expect(calls).toEqual([
        { kind: 'created', path: 'webapp/billing' },
        {
          kind: 'pages',
          project: 'webapp',
          before: ['settings', 'home'],
          after: ['settings', 'home', 'billing'],
        },
      ])
    })

    it('duplicate reports the copy, which holds no notes.json', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await duplicatePage(board.root, 'webapp/home', { cwd, journal })

      expect(calls[0]).toEqual({ kind: 'created', path: 'webapp/home-2' })
      expect(existsSync(join(board.root, 'webapp/home-2/notes.json'))).toBe(
        false,
      )
    })

    it('rename moves the folder through the journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await renamePage(board.root, 'webapp/home', 'start', { cwd, journal })

      expect(calls).toEqual([
        { kind: 'moved', from: 'webapp/home', to: 'webapp/start' },
        {
          kind: 'pages',
          project: 'webapp',
          before: ['settings', 'home'],
          after: ['settings', 'start'],
        },
      ])
    })

    it('move reports the order alone', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await movePage(board.root, 'webapp/home', { cwd, index: 0, journal })

      expect(calls).toEqual([
        {
          kind: 'pages',
          project: 'webapp',
          before: ['settings', 'home'],
          after: ['home', 'settings'],
        },
      ])
    })

    it('move to its own place reports nothing', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await movePage(board.root, 'webapp/home', { cwd, index: 1, journal })

      expect(calls).toEqual([])
    })

    it('delete takes the folder out through the journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await deletePage(board.root, 'webapp/home', { cwd, journal })

      expect(calls[0]).toEqual({ kind: 'removed', path: 'webapp/home' })
      expect(pageOrder()).toEqual(['settings'])
    })
  })
})
