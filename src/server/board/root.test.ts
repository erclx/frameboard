import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveBoard, startBoard } from './root'

describe('root', () => {
  let dir: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-root-')))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function folder(...parts: string[]): string {
    const path = join(dir, ...parts)
    mkdirSync(path, { recursive: true })
    return path
  }

  function marker(...parts: string[]): void {
    writeFileSync(join(folder(...parts), 'board.json'), '{ "version": 1 }\n')
  }

  describe('resolveBoard', () => {
    it('finds board.json in a folder above the working one', async () => {
      marker('boards')

      expect(await resolveBoard({ cwd: folder('boards', 'a', 'b') })).toBe(
        join(dir, 'boards'),
      )
    })

    it('finds .frameboard/board.json at the repository top', async () => {
      folder('repo', '.git')
      marker('repo', '.frameboard')

      expect(await resolveBoard({ cwd: folder('repo', 'src') })).toBe(
        join(dir, 'repo', '.frameboard'),
      )
    })

    it('stops walking at the first folder holding .git', async () => {
      marker()
      folder('repo', '.git')

      await expect(
        resolveBoard({ cwd: folder('repo', 'src') }),
      ).rejects.toMatchObject({ code: 'board-not-found', exitCode: 3 })
    })

    it('takes --root as the board without a marker', async () => {
      folder('canvas')

      expect(await resolveBoard({ root: 'canvas', cwd: dir })).toBe(
        join(dir, 'canvas'),
      )
    })

    it('fails board-not-found on a missing --root', async () => {
      await expect(
        resolveBoard({ root: 'missing', cwd: dir }),
      ).rejects.toMatchObject({ code: 'board-not-found' })
    })
  })

  describe('startBoard', () => {
    it('starts .frameboard/ at the repository top with one empty page', async () => {
      folder('repo', '.git')

      const result = await startBoard(
        { cwd: folder('repo', 'src') },
        new Date('2026-10-18T09:30:00.000Z'),
      )

      expect(result).toEqual({
        root: join(dir, 'repo', '.frameboard'),
        created: true,
      })
      expect(readdirSync(join(result.root, 'untitled', 'page-1'))).toEqual([])
      expect(
        JSON.parse(
          readFileSync(join(result.root, 'untitled', 'project.json'), 'utf8'),
        ),
      ).toEqual({
        version: 1,
        pages: ['page-1'],
        createdAt: '2026-10-18T09:30:00.000Z',
      })
    })

    it('starts .frameboard/ in the working folder outside a repository', async () => {
      const result = await startBoard({ cwd: folder('loose') })

      expect(result.root).toBe(join(dir, 'loose', '.frameboard'))
    })

    it('writes board.json alone into a folder that already has projects', async () => {
      folder('canvas', 'web', 'home')

      const result = await startBoard({ root: 'canvas', cwd: dir })

      expect(result.created).toBe(false)
      expect(readdirSync(join(dir, 'canvas')).sort()).toEqual([
        'board.json',
        'web',
      ])
    })

    it('reuses a board the walk finds', async () => {
      marker('boards')
      folder('boards', 'web')

      const result = await startBoard({ cwd: folder('boards', 'web') })

      expect(result).toEqual({ root: join(dir, 'boards'), created: false })
      expect(existsSync(join(dir, 'boards', 'web', '.frameboard'))).toBe(false)
    })
  })
})
