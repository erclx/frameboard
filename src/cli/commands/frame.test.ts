import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { frameRecordSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
  type FixtureBoardName,
} from '../../../test/support/fixture-board'

describe('frame', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function on(name: FixtureBoardName) {
    board = copyFixtureBoard(name)
    return (...argv: string[]) => cli([...argv, '--json'], { cwd: board.root })
  }

  it.each([
    ['add', ['webapp/home/pricing', '--size', 'phone']],
    ['duplicate', ['webapp/home/hero', '--to', 'marketing/launch']],
    ['move', ['webapp/home/hero', '--x', '-40', '--y', '20']],
    ['resize', ['webapp/home/hero', '--width', '1280']],
    ['order', ['webapp/home/hero', '--index', '1']],
    ['rename', ['webapp/home/hero', 'banner']],
    ['hide', ['webapp/home/hero']],
    ['lock', ['webapp/home/about', '--off']],
  ])('%s returns the frame record', async (verb, args) => {
    const run = on('basic')

    const result = await run('frame', verb, ...args)

    expect(result.exitCode).toBe(0)
    expect(frameRecordSchema.safeParse(result.json().data).success).toBe(true)
  })

  it('lock --off clears the flag', async () => {
    const run = on('basic')

    const result = await run('frame', 'lock', 'webapp/home/about', '--off')

    expect(result.json().data).toMatchObject({ locked: false })
  })

  it('delete returns what it deleted', async () => {
    const run = on('basic')

    const result = await run('frame', 'delete', 'webapp/home/about')

    expect(result.json()).toEqual({
      ok: true,
      data: { deleted: 'webapp/home/about' },
    })
  })

  it('fails frame-not-found, exit 3', async () => {
    const run = on('basic')

    const result = await run(
      'frame',
      'resize',
      'webapp/home/nowhere',
      '--size',
      'phone',
    )

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('frame-not-found')
  })

  it('fails usage, exit 2, when the ref and --project disagree, writing nothing', async () => {
    const run = on('basic')
    const before = readFileSync(
      join(board.root, 'webapp/home/layout.json'),
      'utf8',
    )

    const result = await run(
      'frame',
      'move',
      'webapp/home/hero',
      '--project',
      'marketing',
      '--x',
      '9',
    )

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
    expect(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    ).toBe(before)
  })

  it('fails usage, exit 2, on an unknown size preset', async () => {
    const run = on('basic')

    const result = await run('frame', 'add', 'webapp/home/x', '--size', 'watch')

    expect(result.exitCode).toBe(2)
  })

  it('fails layout-invalid, exit 5, and leaves the layout bytes', async () => {
    const run = on('broken')

    const result = await run('frame', 'hide', 'home/hero')

    expect(result.exitCode).toBe(5)
    expect(result.json().error?.code).toBe('layout-invalid')
    expect(
      readFileSync(join(board.root, 'wrecked/home/layout.json'), 'utf8'),
    ).toBe('{\n')
  })

  it('fails lock-timeout, exit 6, while a live writer holds the layout', async () => {
    const run = on('basic')
    writeFileSync(
      join(board.root, 'webapp/home/layout.json.lock'),
      JSON.stringify({ pid: process.pid }),
    )

    const result = await run('frame', 'hide', 'webapp/home/hero')

    expect(result.exitCode).toBe(6)
    expect(result.json().error?.code).toBe('lock-timeout')
  })
})
