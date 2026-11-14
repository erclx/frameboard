import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
        ['marketing', ['launch', 'states']],
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

    it("reads a project's folder trimmed and its archive flag", async () => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp', 'project.json'),
        JSON.stringify({
          version: 1,
          pages: ['home'],
          group: ' Client ',
          archived: true,
        }),
      )

      const [marketing, webapp] = (await scanBoard(board.root)).projects

      expect([
        [marketing?.group, marketing?.archived],
        [webapp?.group, webapp?.archived],
      ]).toEqual([
        [null, false],
        ['Client', true],
      ])
    })

    it.each([
      ['a number', 7, 'yes'],
      ['a blank', '   ', 1],
      ['a list', ['Client'], null],
    ])(
      'reads a folder that is %s and an archive flag that is not true as absent',
      async (_, group, archived) => {
        board = copyFixtureBoard('basic')
        writeFileSync(
          join(board.root, 'webapp', 'project.json'),
          JSON.stringify({ version: 1, pages: ['home'], group, archived }),
        )

        const [, webapp] = (await scanBoard(board.root)).projects

        expect([
          webapp?.group,
          webapp?.archived,
          webapp?.projectFileError,
        ]).toEqual([null, false, null])
      },
    )

    it("reads a project's turned-off rules in the file's order, each once", async () => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp', 'project.json'),
        JSON.stringify({
          version: 1,
          pages: ['home'],
          checks: { off: ['no-script', 'hand-written', 'no-script'] },
        }),
      )

      const [marketing, webapp] = (await scanBoard(board.root)).projects

      expect([marketing?.checksOff, webapp?.checksOff]).toEqual([
        [],
        ['no-script', 'hand-written'],
      ])
    })

    it.each([
      ['a checks that is a list', ['no-script']],
      ['an off that is a number', { off: 7 }],
      ['an off holding a number', { off: ['no-script', 3] }],
    ])('reads %s as no rule turned off', async (_, checks) => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp', 'project.json'),
        JSON.stringify({ version: 1, pages: ['home'], checks }),
      )

      const [, webapp] = (await scanBoard(board.root)).projects

      expect([webapp?.checksOff, webapp?.projectFileError]).toEqual([[], null])
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
        locked: false,
        hugWidth: false,
        hugHeight: false,
        scroll: false,
        widths: [],
        placed: true,
      })
    })

    it('reads the hug flags an entry holds', async () => {
      board = copyFixtureBoard('basic')
      const layout = join(board.root, 'webapp/home/layout.json')
      writeFileSync(
        layout,
        JSON.stringify({
          version: 1,
          frames: {
            about: {
              x: 1520,
              y: 0,
              width: 390,
              height: 844,
              order: 1,
              hugHeight: true,
            },
          },
        }),
      )

      const { projects } = await scanBoard(board.root, { project: 'webapp' })
      const about = projects[0]?.pages[1]?.frames.find(
        (frame) => frame.name === 'about',
      )

      expect([about?.hugWidth, about?.hugHeight]).toEqual([false, true])
    })

    it.each([
      [
        'a list',
        [{ width: 834, height: 1194 }],
        [{ width: 834, height: 1194 }],
      ],
      ['a string', '834,390', []],
      ['a list of numbers', [834, 390], []],
      ['an object missing height', [{ width: 834 }], []],
    ])('reads widths written as %s', async (_, widths, read) => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp/home/layout.json'),
        JSON.stringify({
          version: 1,
          frames: {
            about: { x: 1520, y: 0, width: 390, height: 844, order: 1, widths },
          },
        }),
      )

      const { projects } = await scanBoard(board.root, { project: 'webapp' })
      const page = projects[0]?.pages[1]
      const about = page?.frames.find((frame) => frame.name === 'about')

      expect([page?.layoutError, about?.widths]).toEqual([null, read])
    })

    it('names the frames each section holds by center, bottom first', async () => {
      board = copyFixtureBoard('basic')
      writeFileSync(
        join(board.root, 'webapp/home/layout.json'),
        JSON.stringify({
          version: 1,
          frames: {
            hero: { x: 0, y: 0, width: 1440, height: 900, order: 0 },
            about: { x: 1520, y: 0, width: 390, height: 844, order: 1 },
          },
          sections: {
            onboarding: { x: -40, y: -40, width: 2000, height: 1000, order: 1 },
            empty: { x: 0, y: 2000, width: 400, height: 400, order: 0 },
          },
        }),
      )

      const { projects } = await scanBoard(board.root, { project: 'webapp' })

      expect(projects[0]?.pages[1]?.sections).toEqual([
        {
          name: 'empty',
          box: { x: 0, y: 2000, width: 400, height: 400 },
          order: 0,
          frames: [],
        },
        {
          name: 'onboarding',
          box: { x: -40, y: -40, width: 2000, height: 1000 },
          order: 1,
          frames: ['hero', 'about'],
        },
      ])
    })

    it('reads a page with no sections key as holding none', async () => {
      board = copyFixtureBoard('basic')

      const { projects } = await scanBoard(board.root, { project: 'webapp' })

      expect(projects[0]?.pages[1]?.sections).toEqual([])
    })
  })

  describe("with transitions of the project's own", () => {
    const ENTER = '@keyframes enter { from { opacity: 0 } }'

    function writeTransition(name: string, css = ENTER): string {
      const folder = join(board.root, 'webapp/assets/transitions')
      mkdirSync(folder, { recursive: true })
      const path = join(folder, `${name}.css`)
      writeFileSync(path, css)
      return path
    }

    function nameHomeTransitions(page: string, frame: string): void {
      const path = join(board.root, 'webapp/home/layout.json')
      const file = JSON.parse(readFileSync(path, 'utf8'))
      file.present = { transition: { name: page } }
      file.frames.hero.transition = { name: frame, ms: 300 }
      writeFileSync(path, JSON.stringify(file))
    }

    const home = async () =>
      (
        await scanBoard(board.root, { project: 'webapp' })
      ).projects[0]?.pages.find((page) => page.name === 'home')

    it('lists the valid ones by name on the project, none on a project holding none', async () => {
      board = copyFixtureBoard('basic')
      writeTransition('wipe')
      writeTransition('curtain')
      writeTransition('broken', 'body { display: none }')

      const { projects } = await scanBoard(board.root)

      expect(
        projects.map((project) => [project.name, project.transitions]),
      ).toEqual([
        ['marketing', []],
        ['webapp', ['curtain', 'wipe']],
      ])
    })

    it('reads a page and a frame naming one as written', async () => {
      board = copyFixtureBoard('basic')
      writeTransition('wipe')
      nameHomeTransitions('wipe', 'wipe')

      const page = await home()

      expect(page?.transition).toEqual({ name: 'wipe' })
      expect(
        page?.frames.find((frame) => frame.name === 'hero')?.transition,
      ).toEqual({ name: 'wipe', ms: 300 })
    })

    it('reads a name whose file is gone or now refused as none', async () => {
      board = copyFixtureBoard('basic')
      const gone = writeTransition('wipe')
      writeTransition('curtain')
      nameHomeTransitions('wipe', 'curtain')
      rmSync(gone)
      writeTransition('curtain', 'body { display: none }')

      const page = await home()

      expect(page).not.toHaveProperty('transition')
      expect(
        page?.frames.find((frame) => frame.name === 'hero'),
      ).not.toHaveProperty('transition')
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
      hugWidth: false,
      hugHeight: false,
      scroll: false,
      widths: [],
      placed: false,
    })
  })

  it('sits past the linked widths a placed frame draws', () => {
    const placed = {
      ...placeNext([]),
      widths: [{ width: 390, height: 844 }],
    }

    expect(placeNext([placed]).box.x).toBe(1990)
  })
})
