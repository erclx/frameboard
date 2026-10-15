import { afterEach, describe, expect, it } from 'vitest'

import { listResultSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

describe('list', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  it('prints the list result in one envelope', async () => {
    board = copyFixtureBoard('basic')

    const run = await cli(['list', '--json', '--root', board.root], {
      cwd: board.root,
    })

    expect(run.exitCode).toBe(0)
    expect(run.json().ok).toBe(true)
    expect(listResultSchema.safeParse(run.json().data).success).toBe(true)
  })

  it('finds the board from a folder inside it', async () => {
    board = copyFixtureBoard('basic')

    const run = await cli(['list', '--json', '--project', 'webapp'], {
      cwd: `${board.root}/webapp/home`,
    })

    expect(run.json()).toMatchObject({
      ok: true,
      data: { root: board.root, projects: [{ name: 'webapp' }] },
    })
  })

  it('fails project-not-found, exit 3, on an unknown --project', async () => {
    board = copyFixtureBoard('basic')

    const run = await cli(['list', '--json', '--project', 'nowhere'], {
      cwd: board.root,
    })

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('project-not-found')
  })

  it('reports an invalid layout on its page and exits 0', async () => {
    board = copyFixtureBoard('broken')

    const run = await cli(['list', '--json'], { cwd: board.root })

    expect(run.exitCode).toBe(0)
    expect(run.json()).toMatchObject({
      data: {
        projects: [{ pages: [{ layoutError: { path: expect.any(String) } }] }],
      },
    })
  })
})
