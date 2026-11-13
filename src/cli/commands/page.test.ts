import { afterEach, describe, expect, it } from 'vitest'

import { pageRecordSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
  type FixtureBoardName,
} from '../../../test/support/fixture-board'

describe('page', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function on(name: FixtureBoardName) {
    board = copyFixtureBoard(name)
    return (...argv: string[]) => cli([...argv, '--json'], { cwd: board.root })
  }

  it('add returns the page record', async () => {
    const run = on('basic')

    const result = await run('page', 'add', 'webapp/billing', '--index', '0')

    expect(result.exitCode).toBe(0)
    expect(pageRecordSchema.safeParse(result.json().data).success).toBe(true)
    expect(result.json().data).toMatchObject({ index: 0 })
  })

  it('duplicate takes the next free name', async () => {
    const run = on('basic')

    const result = await run('page', 'duplicate', 'home', '--project', 'webapp')

    expect(result.json().data).toMatchObject({ ref: 'webapp/home-2' })
  })

  it('rename fails project-required, exit 2, on a short ref over two projects', async () => {
    const run = on('basic')

    const result = await run('page', 'rename', 'home', 'start')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('project-required')
  })

  it('move fails usage, exit 2, without --index', async () => {
    const run = on('basic')

    const result = await run('page', 'move', 'webapp/home')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })

  describe('transition', () => {
    it('answers the page with the transition it set', async () => {
      const run = on('basic')

      const result = await run(
        'page',
        'transition',
        'webapp/home',
        'slide',
        '--direction',
        'up',
        '--ms',
        '300',
      )

      expect(result.exitCode).toBe(0)
      expect(pageRecordSchema.safeParse(result.json().data).success).toBe(true)
      expect(result.json().data).toHaveProperty('transition', {
        name: 'slide',
        direction: 'up',
        ms: 300,
      })
    })

    it('answers the page with no transition after none', async () => {
      const run = on('basic')
      await run('page', 'transition', 'webapp/home', 'fade')

      const result = await run('page', 'transition', 'webapp/home', 'none')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).not.toHaveProperty('transition')
    })

    it('refuses an unknown transition with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run('page', 'transition', 'webapp/home', 'cube')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('refuses a direction on a transition taking none with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run(
        'page',
        'transition',
        'webapp/home',
        'fade',
        '--direction',
        'up',
      )

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('refuses a duration past the ceiling with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run(
        'page',
        'transition',
        'webapp/home',
        'fade',
        '--ms',
        '9000',
      )

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })
  })

  it('delete fails page-not-found, exit 3', async () => {
    const run = on('basic')

    const result = await run('page', 'delete', 'webapp/nowhere')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('page-not-found')
  })

  it('add fails project-file-invalid, exit 5, on a broken project.json', async () => {
    const run = on('broken')

    const result = await run('page', 'add', 'extra')

    expect(result.exitCode).toBe(5)
    expect(result.json().error?.code).toBe('project-file-invalid')
  })
})
