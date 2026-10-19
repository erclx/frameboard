import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import { addProject, deleteProject, renameProject } from './projects'

describe('projects', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  describe('addProject', () => {
    it('creates the project with one empty page', async () => {
      const project = await addProject(board.root, 'brand')

      expect(project).toMatchObject({
        name: 'brand',
        projectFileError: null,
        pages: [{ ref: 'brand/page-1', index: 0, frames: [] }],
      })
    })

    it('records when it was made, once, in project.json', async () => {
      await addProject(
        board.root,
        'brand',
        new Date('2026-10-18T09:30:00.000Z'),
      )

      expect(
        JSON.parse(
          readFileSync(join(board.root, 'brand', 'project.json'), 'utf8'),
        ),
      ).toEqual({
        version: 1,
        pages: ['page-1'],
        createdAt: '2026-10-18T09:30:00.000Z',
      })
    })

    it('fails name-taken on a name held in another case', async () => {
      await expect(addProject(board.root, 'WebApp')).rejects.toMatchObject({
        code: 'name-taken',
        exitCode: 4,
      })
    })

    it('fails invalid-name and writes nothing', async () => {
      await expect(addProject(board.root, '.hidden')).rejects.toMatchObject({
        code: 'invalid-name',
      })
      expect(readdirSync(board.root).sort()).toEqual([
        'board.json',
        'marketing',
        'tokens.css',
        'webapp',
      ])
    })
  })

  describe('renameProject', () => {
    it('moves the folder and keeps its pages', async () => {
      const project = await renameProject(board.root, 'webapp', 'app')

      expect(project.pages.map((page) => page.ref)).toEqual([
        'app/settings',
        'app/home',
      ])
      expect(existsSync(join(board.root, 'webapp'))).toBe(false)
    })

    it('fails name-taken on another project name', async () => {
      await expect(
        renameProject(board.root, 'webapp', 'marketing'),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })
  })

  describe('deleteProject', () => {
    it('removes the folder outright', async () => {
      expect(await deleteProject(board.root, 'marketing')).toEqual({
        deleted: 'marketing',
      })
      expect(existsSync(join(board.root, 'marketing'))).toBe(false)
    })
  })

  describe('with a journal', () => {
    it('add reports the project folder it created', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await addProject(board.root, 'brand', new Date(), { journal })

      expect(calls).toEqual([{ kind: 'created', path: 'brand' }])
    })

    it('rename moves the folder through the journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await renameProject(board.root, 'webapp', 'site', { journal })

      expect(calls).toEqual([{ kind: 'moved', from: 'webapp', to: 'site' }])
    })

    it('delete takes the folder out through the journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await deleteProject(board.root, 'webapp', { journal })

      expect(calls).toEqual([{ kind: 'removed', path: 'webapp' }])
    })
  })
})
