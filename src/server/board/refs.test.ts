import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { resolveFrameRef, resolvePageRef, resolveProject } from './refs'

describe('refs', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  describe('on a board with two projects', () => {
    beforeEach(() => {
      board = copyFixtureBoard('basic')
    })

    it('resolves a full frame ref to its file', async () => {
      expect(
        await resolveFrameRef(board.root, 'webapp/home/hero', {
          cwd: board.root,
        }),
      ).toEqual({
        root: board.root,
        project: 'webapp',
        page: 'home',
        name: 'hero',
        path: join(board.root, 'webapp/home/hero.html'),
      })
    })

    it('resolves a short frame ref through --project', async () => {
      const ref = await resolveFrameRef(board.root, 'home/hero', {
        project: 'webapp',
        cwd: board.root,
      })

      expect(ref.path).toBe(join(board.root, 'webapp/home/hero.html'))
    })

    it('resolves a path to the .html file against the working folder', async () => {
      const ref = await resolveFrameRef(board.root, 'home/hero.html', {
        cwd: join(board.root, 'webapp'),
      })

      expect(ref).toMatchObject({
        project: 'webapp',
        page: 'home',
        name: 'hero',
      })
    })

    it('takes the on-disk case of a name matched in another case', async () => {
      const ref = await resolveFrameRef(board.root, 'webapp/HOME/Hero', {
        cwd: board.root,
      })

      expect([ref.page, ref.name]).toEqual(['home', 'hero'])
    })

    it('fails project-required on a short ref with no --project', async () => {
      await expect(
        resolvePageRef(board.root, 'home', { cwd: board.root }),
      ).rejects.toMatchObject({ code: 'project-required', exitCode: 2 })
    })

    it('fails usage when the ref and --project disagree', async () => {
      await expect(
        resolveFrameRef(board.root, 'webapp/home/hero', {
          project: 'marketing',
          cwd: board.root,
        }),
      ).rejects.toMatchObject({ code: 'usage', exitCode: 2 })
    })

    it('fails usage on a path outside the board', async () => {
      await expect(
        resolveFrameRef(board.root, '../elsewhere/page/hero.html', {
          cwd: board.root,
        }),
      ).rejects.toMatchObject({ code: 'usage' })
    })

    it.each([
      ['project-not-found', 'nowhere/home/hero'],
      ['page-not-found', 'webapp/nowhere/hero'],
      ['frame-not-found', 'webapp/home/nowhere'],
    ])('fails %s on a missing target', async (code, ref) => {
      await expect(
        resolveFrameRef(board.root, ref, { cwd: board.root }),
      ).rejects.toMatchObject({ code, exitCode: 3 })
    })

    it('resolves a missing frame when the verb creates it', async () => {
      const ref = await resolveFrameRef(board.root, 'webapp/home/new', {
        cwd: board.root,
        allowMissing: true,
      })

      expect(ref.path).toBe(join(board.root, 'webapp/home/new.html'))
    })

    it('fails invalid-name on a missing frame whose name breaks the rule', async () => {
      await expect(
        resolveFrameRef(board.root, 'webapp/home/-new', {
          cwd: board.root,
          allowMissing: true,
        }),
      ).rejects.toMatchObject({ code: 'invalid-name' })
    })

    it('fails invalid-name on a new page named assets', async () => {
      await expect(
        resolvePageRef(board.root, 'webapp/assets', {
          cwd: board.root,
          allowMissing: true,
        }),
      ).rejects.toMatchObject({ code: 'invalid-name' })
    })
  })

  describe('resolveProject', () => {
    it('takes the only project when none is named', async () => {
      board = copyFixtureBoard('hand-made')

      expect(await resolveProject(board.root)).toEqual({
        name: 'sketches',
        path: join(board.root, 'sketches'),
      })
    })
  })
})
