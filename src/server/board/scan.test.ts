import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { listResultSchema } from '@/shared/records/list'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { placeNext, scanBoard } from './scan'

describe('scanBoard', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  describe('on the basic board', () => {
    it('returns a list result its schema accepts', async () => {
      board = copyFixtureBoard('basic')

      const result = await scanBoard(board.root)

      expect(listResultSchema.safeParse(result).success).toBe(true)
    })

    it('lists projects by name and pages in project.json order', async () => {
      board = copyFixtureBoard('basic')

      const { projects } = await scanBoard(board.root)

      expect(
        projects.map((project) => [
          project.name,
          project.pages.map((page) => page.name),
        ]),
      ).toEqual([
        ['marketing', ['launch']],
        ['webapp', ['settings', 'home']],
      ])
    })

    it("reads a project's creation time, null on one that records none", async () => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp', 'project.json'),
        JSON.stringify({
          version: 1,
          pages: ['settings', 'home'],
          createdAt: '2026-09-02T08:00:00.000Z',
        }),
      )

      const { projects } = await scanBoard(board.root)

      expect(projects.map((project) => project.createdAt)).toEqual([
        null,
        '2026-09-02T08:00:00.000Z',
      ])
    })

    it('reads a creation time that is not a time as none', async () => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp', 'project.json'),
        JSON.stringify({ version: 1, pages: ['home'], createdAt: 'yesterday' }),
      )

      const [, webapp] = (await scanBoard(board.root)).projects

      expect([webapp?.createdAt, webapp?.projectFileError]).toEqual([
        null,
        null,
      ])
    })

    it('reads a placed frame from its layout entry', async () => {
      board = copyFixtureBoard('basic')

      const { projects } = await scanBoard(board.root, { project: 'webapp' })

      expect(projects[0]?.pages[1]?.frames[1]).toMatchObject({
        ref: 'webapp/home/about',
        path: join(board.root, 'webapp/home/about.html'),
        box: { x: 1520, y: 0, width: 390, height: 844 },
        order: 1,
        hidden: false,
        locked: true,
        placed: true,
      })
    })
  })

  describe('on the hand-made board', () => {
    it('orders pages by name with no project.json and skips assets', async () => {
      board = copyFixtureBoard('hand-made')

      const { projects } = await scanBoard(board.root)

      expect(projects[0]?.pages.map((page) => page.name)).toEqual([
        'drafts',
        'ideas',
      ])
    })

    it('places unplaced frames past the placed ones in name order', async () => {
      board = copyFixtureBoard('hand-made')

      const { projects } = await scanBoard(board.root)

      expect(
        projects[0]?.pages[0]?.frames.map((frame) => [
          frame.name,
          frame.box.x,
          frame.order,
          frame.placed,
        ]),
      ).toEqual([
        ['placed', 100, 3, true],
        ['Bad Name', 570, 4, false],
        ['loose', 2090, 5, false],
      ])
    })

    it('starts at the origin on a page with no layout.json', async () => {
      board = copyFixtureBoard('hand-made')

      const { projects } = await scanBoard(board.root)

      expect(projects[0]?.pages[1]?.frames.map((frame) => frame.box)).toEqual([
        { x: 0, y: 0, width: 1440, height: 900 },
        { x: 1520, y: 0, width: 1440, height: 900 },
      ])
    })
  })

  describe('on the broken board', () => {
    it('reports the project file and the layout rather than failing', async () => {
      board = copyFixtureBoard('broken')

      const { projects } = await scanBoard(board.root)

      expect(projects[0]?.projectFileError?.path).toBe(
        join(board.root, 'wrecked/project.json'),
      )
      expect(projects[0]?.pages[0]?.layoutError?.path).toBe(
        join(board.root, 'wrecked/home/layout.json'),
      )
    })

    it('still lists the frames of a page whose layout is invalid', async () => {
      board = copyFixtureBoard('broken')

      const { projects } = await scanBoard(board.root)

      expect(projects[0]?.pages[0]?.frames.map((frame) => frame.ref)).toEqual([
        'wrecked/home/hero',
      ])
    })
  })
})

describe('placeNext', () => {
  it('sits at the origin on an empty page', () => {
    expect(placeNext([])).toEqual({
      box: { x: 0, y: 0, width: 1440, height: 900 },
      order: 0,
      hidden: false,
      locked: false,
      placed: false,
    })
  })
})
