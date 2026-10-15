import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { projectRecordSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

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

  it('fails usage with exit 2 on a missing argument', async () => {
    const result = await run('project', 'rename', 'webapp')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })
})
