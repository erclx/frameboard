import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import {
  addProject,
  deleteProject,
  duplicateProject,
  fileProjects,
  keepingTimes,
  renameProject,
  setProjectRule,
} from './projects'

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

  describe('duplicateProject', () => {
    it('copies the pages under the next free name, leaving notes behind', async () => {
      const project = await duplicateProject(board.root, 'webapp')

      expect(project.pages.map((page) => page.ref)).toEqual([
        'webapp-2/settings',
        'webapp-2/home',
      ])
      expect(existsSync(join(board.root, 'webapp-2/home/hero.html'))).toBe(true)
      expect(existsSync(join(board.root, 'webapp-2/home/notes.json'))).toBe(
        false,
      )
      expect(existsSync(join(board.root, 'webapp/home/notes.json'))).toBe(true)
    })

    it('stamps the copy with its own createdAt', async () => {
      await duplicateProject(
        board.root,
        'webapp',
        new Date('2026-10-19T08:00:00.000Z'),
      )

      expect(
        JSON.parse(
          readFileSync(join(board.root, 'webapp-2', 'project.json'), 'utf8'),
        ),
      ).toEqual({
        version: 1,
        pages: ['settings', 'home'],
        createdAt: '2026-10-19T08:00:00.000Z',
      })
    })

    it('keeps the folder on the copy and leaves the archive behind', async () => {
      await fileProjects(board.root, ['webapp'], { group: 'Client' })
      await fileProjects(board.root, ['webapp'], { archived: true })

      const copy = await duplicateProject(board.root, 'webapp')

      expect([copy.group, copy.archived]).toEqual(['Client', false])
    })

    it('takes the next free name past an earlier copy', async () => {
      await duplicateProject(board.root, 'webapp')

      const project = await duplicateProject(board.root, 'webapp')

      expect(project.name).toBe('webapp-3')
    })

    it('fails not-found on a project the board lacks', async () => {
      await expect(duplicateProject(board.root, 'brand')).rejects.toMatchObject(
        { code: 'project-not-found' },
      )
    })
  })

  describe('duplicateProject with assets', () => {
    let live: FixtureBoard

    beforeEach(() => {
      live = copyFixtureBoard('live')
    })

    afterEach(() => {
      live.cleanup()
    })

    it('keeps the project assets byte for byte', async () => {
      await duplicateProject(live.root, 'studio')

      expect(readFileSync(join(live.root, 'studio-2/assets/dot.svg'))).toEqual(
        readFileSync(join(live.root, 'studio/assets/dot.svg')),
      )
    })
  })

  describe('fileProjects', () => {
    const projectFile = (name: string) => join(board.root, name, 'project.json')
    const read = (name: string) =>
      JSON.parse(readFileSync(projectFile(name), 'utf8'))

    it('files several projects in one folder, keeping every other key', async () => {
      writeFileSync(
        projectFile('webapp'),
        JSON.stringify({
          version: 1,
          pages: ['settings', 'home'],
          createdAt: '2026-09-02T08:00:00.000Z',
          checks: { noUppercase: true },
          later: { kept: 1 },
        }),
      )

      const records = await fileProjects(board.root, ['webapp', 'marketing'], {
        group: '  Client work ',
      })

      expect(records.map((record) => record.group)).toEqual([
        'Client work',
        'Client work',
      ])
      expect(read('webapp')).toEqual({
        version: 1,
        pages: ['settings', 'home'],
        createdAt: '2026-09-02T08:00:00.000Z',
        checks: { noUppercase: true },
        later: { kept: 1 },
        group: 'Client work',
      })
    })

    it('leaves the project file and folder times as they were', async () => {
      const past = new Date('2026-01-01T00:00:00.000Z')
      utimesSync(projectFile('webapp'), past, past)
      utimesSync(join(board.root, 'webapp'), past, past)

      await fileProjects(board.root, ['webapp'], { group: 'Client' })

      expect([
        statSync(projectFile('webapp')).mtime.toISOString(),
        statSync(join(board.root, 'webapp')).mtime.toISOString(),
      ]).toEqual([past.toISOString(), past.toISOString()])
    })

    it('takes a project out of its folder on a null group', async () => {
      await fileProjects(board.root, ['webapp'], { group: 'Client' })

      const [record] = await fileProjects(board.root, ['webapp'], {
        group: null,
      })

      expect(record?.group).toBeNull()
      expect(read('webapp')).toEqual({
        version: 1,
        pages: ['settings', 'home'],
      })
    })

    it('archives and restores a project, keeping its folder', async () => {
      await fileProjects(board.root, ['webapp'], { group: 'Client' })

      const [archived] = await fileProjects(board.root, ['webapp'], {
        archived: true,
      })
      const [restored] = await fileProjects(board.root, ['webapp'], {
        archived: false,
      })

      expect([archived?.archived, restored?.archived]).toEqual([true, false])
      expect(read('webapp')).toEqual({
        version: 1,
        pages: ['settings', 'home'],
        group: 'Client',
      })
    })

    it('refuses the whole filing when one project file fails to parse', async () => {
      writeFileSync(projectFile('webapp'), '{ not json')

      await expect(
        fileProjects(board.root, ['marketing', 'webapp'], { group: 'Client' }),
      ).rejects.toMatchObject({ code: 'project-file-invalid' })
      expect(readFileSync(projectFile('webapp'), 'utf8')).toBe('{ not json')
      expect(read('marketing')).toEqual({
        version: 1,
        pages: ['launch', 'states'],
      })
    })

    it('fails not-found on a project the board lacks', async () => {
      await expect(
        fileProjects(board.root, ['nope'], { group: 'Client' }),
      ).rejects.toMatchObject({ code: 'project-not-found' })
    })
  })

  describe('setProjectRule', () => {
    const projectFile = (name: string) => join(board.root, name, 'project.json')
    const read = (name: string) =>
      JSON.parse(readFileSync(projectFile(name), 'utf8'))
    const write = (name: string, file: unknown) =>
      writeFileSync(projectFile(name), JSON.stringify(file))

    it('adds the rule to checks.off, keeping every other key', async () => {
      write('webapp', {
        version: 1,
        pages: ['settings', 'home'],
        checks: { noUppercase: true, later: 1 },
        group: 'Client',
        later: { kept: 1 },
      })

      const result = await setProjectRule(
        board.root,
        'webapp',
        'generic-font',
        true,
      )

      expect(result).toEqual({ project: 'webapp', off: ['generic-font'] })
      expect(read('webapp')).toEqual({
        version: 1,
        pages: ['settings', 'home'],
        checks: { noUppercase: true, later: 1, off: ['generic-font'] },
        group: 'Client',
        later: { kept: 1 },
      })
    })

    it('holds the id once when the rule is turned off twice', async () => {
      await setProjectRule(board.root, 'webapp', 'generic-font', true)

      const result = await setProjectRule(
        board.root,
        'webapp',
        'generic-font',
        true,
      )

      expect(result.off).toEqual(['generic-font'])
      expect(read('webapp').checks.off).toEqual(['generic-font'])
    })

    it('leaves a rule turned off by hand as written', async () => {
      write('webapp', {
        version: 1,
        pages: ['home'],
        checks: { off: ['theme', 'generic-font'] },
      })
      const before = readFileSync(projectFile('webapp'), 'utf8')

      await setProjectRule(board.root, 'webapp', 'generic-font', true)

      expect(readFileSync(projectFile('webapp'), 'utf8')).toBe(before)
    })

    it('turns one rule back on and leaves the others off', async () => {
      write('webapp', {
        version: 1,
        pages: ['home'],
        checks: { off: ['theme', 'generic-font'] },
      })

      const result = await setProjectRule(board.root, 'webapp', 'theme', false)

      expect(result.off).toEqual(['generic-font'])
      expect(read('webapp').checks).toEqual({ off: ['generic-font'] })
    })

    it('leaves no empty checks behind when the last rule comes back on', async () => {
      const before = read('webapp')
      await setProjectRule(board.root, 'webapp', 'theme', true)

      await setProjectRule(board.root, 'webapp', 'theme', false)

      expect(read('webapp')).toEqual(before)
    })

    it('replaces an off value that is not a list of ids', async () => {
      write('webapp', { version: 1, pages: ['home'], checks: { off: 3 } })

      await setProjectRule(board.root, 'webapp', 'theme', true)

      expect(read('webapp').checks).toEqual({ off: ['theme'] })
    })

    it('refuses a checks value that is not an object and writes nothing', async () => {
      write('webapp', { version: 1, pages: ['home'], checks: 'strict' })

      await expect(
        setProjectRule(board.root, 'webapp', 'theme', true),
      ).rejects.toMatchObject({ code: 'project-file-invalid' })
      expect(read('webapp').checks).toBe('strict')
    })

    it('refuses a project the board does not hold', async () => {
      await expect(
        setProjectRule(board.root, 'nope', 'theme', true),
      ).rejects.toMatchObject({ code: 'project-not-found' })
    })

    it('reports the off list on each side to the journal, and nothing for a repeat', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await setProjectRule(board.root, 'webapp', 'theme', true, { journal })
      await setProjectRule(board.root, 'webapp', 'theme', true, { journal })

      expect(calls).toEqual([
        {
          kind: 'project',
          file: 'webapp/project.json',
          before: {},
          after: { off: ['theme'] },
        },
      ])
    })
  })

  describe('keepingTimes', () => {
    it("keeps the time a writer gave the file before the filing's lock", async () => {
      const file = join(board.root, 'webapp', 'project.json')
      const folder = join(board.root, 'webapp')
      const past = new Date('2026-01-01T00:00:00.000Z')
      const agent = new Date('2026-06-01T00:00:00.000Z')
      utimesSync(file, past, past)
      utimesSync(folder, past, past)

      await keepingTimes([file], async (keep) => {
        writeFileSync(file, JSON.stringify({ version: 1, pages: ['home'] }))
        utimesSync(file, agent, agent)
        utimesSync(folder, agent, agent)
        await keep(file)
        writeFileSync(file, JSON.stringify({ version: 1, pages: ['home'] }))
      })

      expect([
        statSync(file).mtime.toISOString(),
        statSync(folder).mtime.toISOString(),
      ]).toEqual([agent.toISOString(), agent.toISOString()])
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

    it('a filing reports both keys on each side of each file it changed', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await fileProjects(
        board.root,
        ['webapp', 'marketing'],
        { archived: true },
        { journal },
      )

      expect(calls).toEqual([
        {
          kind: 'project',
          file: 'webapp/project.json',
          before: {},
          after: { archived: true },
        },
        {
          kind: 'project',
          file: 'marketing/project.json',
          before: {},
          after: { archived: true },
        },
      ])
    })

    it('a filing that changes nothing reports nothing', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await fileProjects(board.root, ['webapp'], { group: null }, { journal })

      expect(calls).toEqual([])
    })

    it('duplicate reports the copy it created', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await duplicateProject(board.root, 'webapp', new Date(), { journal })

      expect(calls).toEqual([{ kind: 'created', path: 'webapp-2' }])
    })
  })
})
