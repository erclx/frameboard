import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cli } from '../../../test/support/cli'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

describe('kit', () => {
  let board: TempBoard

  beforeEach(() => {
    board = writeBoard({
      'acme/project.json': '{ "version": 1, "pages": [] }\n',
      'beta/project.json': '{ "version": 1, "pages": [] }\n',
      'outside/plain/kit.json':
        '{ "version": 1, "title": "Plain", "description": "From a folder" }\n',
      'outside/plain/tokens.css': ':root { --accent: teal }\n',
    })
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(...argv: string[]) {
    return cli([...argv, '--json'], { cwd: board.root })
  }

  it('list answers each kit by name, shipped first', async () => {
    const result = await run('kit', 'list')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toEqual([
      expect.objectContaining({ name: 'clean', source: 'shipped' }),
      expect.objectContaining({ name: 'sketch', source: 'shipped' }),
      expect.objectContaining({ name: 'wireframe', source: 'shipped' }),
    ])
  })

  it('add copies a named kit into the project and answers the folder it wrote', async () => {
    const result = await run('kit', 'add', 'acme', 'wireframe')

    expect(result.exitCode).toBe(0)
    expect(result.json()).toEqual({
      ok: true,
      data: {
        project: 'acme',
        kit: 'wireframe',
        written: [join(board.root, 'acme/assets/kits/wireframe')],
      },
    })
  })

  it('add --from copies the kit in a folder, resolved from the working folder', async () => {
    const result = await run('kit', 'add', 'acme', '--from', 'outside/plain')

    expect(result.exitCode).toBe(0)
    expect(
      readFileSync(
        join(board.root, 'acme/assets/kits/plain/tokens.css'),
        'utf8',
      ),
    ).toBe(':root { --accent: teal }\n')
  })

  it.each([
    ['neither a kit nor --from', []],
    ['both a kit and --from', ['clean', '--from', 'outside/plain']],
  ])('add fails usage with exit 2 on %s', async (_case, rest) => {
    const result = await run('kit', 'add', 'acme', ...rest)

    expect(result.exitCode).toBe(2)
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  it('add fails kit-not-found with exit 3 on a kit nobody holds', async () => {
    const result = await run('kit', 'add', 'acme', 'missing')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('kit-not-found')
  })

  it('add leaves a board sheet and a project sheet as they were', async () => {
    writeFileSync(join(board.root, 'tokens.css'), ':root { --a: 1 }\n')
    writeFileSync(join(board.root, 'acme/tokens.css'), ':root { --a: 2 }\n')

    const result = await run('kit', 'add', 'acme', 'clean')

    expect(result.exitCode).toBe(0)
    expect([
      readFileSync(join(board.root, 'tokens.css'), 'utf8'),
      readFileSync(join(board.root, 'acme/tokens.css'), 'utf8'),
    ]).toEqual([':root { --a: 1 }\n', ':root { --a: 2 }\n'])
  })

  it('add fails name-taken with exit 4 on a kit the project already holds', async () => {
    await run('kit', 'add', 'acme', 'clean')

    const result = await run('kit', 'add', 'acme', 'clean')

    expect(result.exitCode).toBe(4)
    expect(result.json().error?.code).toBe('name-taken')
  })

  it('add accepts --replace and ignores it, adding the kit beside the one held', async () => {
    await run('kit', 'add', 'acme', 'clean')

    const result = await run('kit', 'add', 'acme', 'sketch', '--replace')

    expect(result.exitCode).toBe(0)
    expect(readdirSync(join(board.root, 'acme/assets/kits')).sort()).toEqual([
      'clean',
      'sketch',
    ])
  })

  it('remove takes the kit out of the project and answers the frames it cleared', async () => {
    await run('kit', 'add', 'acme', 'clean')

    const result = await run('kit', 'remove', 'acme', 'clean')

    expect(result.exitCode).toBe(0)
    expect(result.json()).toEqual({
      ok: true,
      data: { project: 'acme', kit: 'clean', frames: [] },
    })
    expect(existsSync(join(board.root, 'acme/assets/kits/clean'))).toBe(false)
  })

  it('remove fails kit-not-found with exit 3 on a kit the project lacks', async () => {
    const result = await run('kit', 'remove', 'acme', 'clean')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('kit-not-found')
  })

  it('save makes a kit another project then adds by name', async () => {
    writeFileSync(join(board.root, 'acme/tokens.css'), ':root { --a: 1 }\n')

    const saved = await run('kit', 'save', 'acme', 'brainstorm')
    const added = await run('kit', 'add', 'beta', 'brainstorm')

    expect(saved.json()).toEqual({
      ok: true,
      data: {
        project: 'acme',
        kit: 'brainstorm',
        path: join(board.root, '.kits/brainstorm'),
      },
    })
    expect(added.exitCode).toBe(0)
  })
})
