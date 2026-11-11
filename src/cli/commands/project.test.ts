import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { projectRecordSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

describe('project', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(...argv: string[]) {
    return cli([...argv, '--json'], { cwd: board.root })
  }

  it('add returns the project record', async () => {
    const result = await run('project', 'add', 'brand')

    expect(result.exitCode).toBe(0)
    expect(projectRecordSchema.safeParse(result.json().data).success).toBe(true)
  })

  it('add fails invalid-name with exit 2', async () => {
    const result = await run('project', 'add', 'two words')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('invalid-name')
  })

  it('rename fails name-taken with exit 4', async () => {
    const result = await run('project', 'rename', 'webapp', 'marketing')

    expect(result.exitCode).toBe(4)
    expect(result.json().error?.code).toBe('name-taken')
  })

  it('delete returns what it deleted', async () => {
    const result = await run('project', 'delete', 'marketing')

    expect(result.json()).toEqual({ ok: true, data: { deleted: 'marketing' } })
  })

  describe('tokens', () => {
    let bare: TempBoard

    beforeEach(() => {
      bare = writeBoard({
        'acme/project.json': '{ "version": 1, "pages": [] }\n',
      })
    })

    afterEach(() => {
      bare.cleanup()
    })

    it('writes the starter sheet and answers its path and look', async () => {
      const result = await cli(
        ['project', 'tokens', 'acme', '--accent', 'purple', '--json'],
        { cwd: bare.root },
      )

      expect(result.exitCode).toBe(0)
      expect(result.json()).toEqual({
        ok: true,
        data: {
          project: 'acme',
          path: join(bare.root, 'acme', 'tokens.css'),
          accent: 'purple',
          font: 'geist',
        },
      })
    })

    it('fails tokens-exist with exit 4 under the board sheet', async () => {
      const result = await run('project', 'tokens', 'webapp')

      expect(result.exitCode).toBe(4)
      expect(result.json().error?.code).toBe('tokens-exist')
    })

    it('fails usage with exit 2 on a font outside the presets', async () => {
      const result = await cli(
        ['project', 'tokens', 'acme', '--font', 'comic', '--json'],
        { cwd: bare.root },
      )

      expect(result.exitCode).toBe(2)
      expect(existsSync(join(bare.root, 'acme', 'tokens.css'))).toBe(false)
    })

    it('fails usage with exit 2 on a served face that starts no look', async () => {
      const result = await cli(
        ['project', 'tokens', 'acme', '--font', 'caveat', '--json'],
        { cwd: bare.root },
      )

      expect(result.exitCode).toBe(2)
      expect(existsSync(join(bare.root, 'acme', 'tokens.css'))).toBe(false)
    })
  })

  describe('group', () => {
    let filing: TempBoard

    beforeEach(() => {
      filing = writeBoard({
        'acme/project.json':
          '{ "version": 1, "pages": ["home"], "checks": { "tokens": "warn" }, "custom": [1, 2] }\n',
        'acme/home/.gitkeep': '',
      })
    })

    afterEach(() => {
      filing.cleanup()
    })

    function file(...argv: string[]) {
      return cli([...argv, '--json'], { cwd: filing.root })
    }

    function projectFile() {
      return JSON.parse(
        readFileSync(join(filing.root, 'acme', 'project.json'), 'utf8'),
      ) as Record<string, unknown>
    }

    it('files the project under the folder and answers its record', async () => {
      const result = await file('project', 'group', 'acme', 'Client work')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        name: 'acme',
        group: 'Client work',
        archived: false,
      })
    })

    it('keeps pages, checks, and unknown keys as written', async () => {
      await file('project', 'group', 'acme', 'Client')

      expect(projectFile()).toEqual({
        version: 1,
        pages: ['home'],
        checks: { tokens: 'warn' },
        custom: [1, 2],
        group: 'Client',
      })
    })

    it('answers the record when the project is already in that folder', async () => {
      await file('project', 'group', 'acme', 'Client')

      const result = await file('project', 'group', 'acme', 'Client')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({ group: 'Client' })
    })

    it('takes the project out of its folder with --clear', async () => {
      await file('project', 'group', 'acme', 'Client')

      const result = await file('project', 'group', 'acme', '--clear')

      expect(result.json().data).toMatchObject({ group: null })
      expect(projectFile()).not.toHaveProperty('group')
    })

    it('fails invalid-name with exit 2 on a blank folder, writing nothing', async () => {
      await file('project', 'group', 'acme', 'Client')

      const result = await file('project', 'group', 'acme', '   ')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('invalid-name')
      expect(projectFile()).toHaveProperty('group', 'Client')
    })

    it('fails invalid-name with exit 2 on a folder over 256 characters', async () => {
      const result = await file('project', 'group', 'acme', 'a'.repeat(257))

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('invalid-name')
      expect(projectFile()).not.toHaveProperty('group')
    })

    it('fails usage with exit 2 given both a folder and --clear', async () => {
      const result = await file('project', 'group', 'acme', 'Client', '--clear')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
      expect(projectFile()).not.toHaveProperty('group')
    })

    it('fails usage with exit 2 given neither a folder nor --clear', async () => {
      const result = await file('project', 'group', 'acme')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('fails project-not-found with exit 3 on an unknown project', async () => {
      const result = await file('project', 'group', 'brand', 'Client')

      expect(result.exitCode).toBe(3)
      expect(result.json().error?.code).toBe('project-not-found')
    })

    it('names the project and folder on its human line', async () => {
      const result = await cli(['project', 'group', 'acme', 'Client'], {
        cwd: filing.root,
      })

      expect(result.stdout).toContain('acme')
      expect(result.stdout).toContain('Client')
    })
  })

  it('fails usage with exit 2 on a missing argument', async () => {
    const result = await run('project', 'rename', 'webapp')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })
})
