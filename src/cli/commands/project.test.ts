import { existsSync } from 'node:fs'
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
  })

  it('fails usage with exit 2 on a missing argument', async () => {
    const result = await run('project', 'rename', 'webapp')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })
})
