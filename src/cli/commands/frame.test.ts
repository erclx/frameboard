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

  it('fit refuses frame-not-found, exit 3, ahead of launching a browser', async () => {
    const run = on('basic')

    const result = await run('frame', 'fit', 'webapp/home/missing')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('frame-not-found')
  })

  describe('scroll', () => {
    it('add --scroll at a preset holds the size and hugs neither axis', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing',
        '--size',
        'phone',
        '--scroll',
      )

      expect(result.json().data).toMatchObject({
        box: { width: 390, height: 844 },
        hugWidth: false,
        hugHeight: false,
        scroll: true,
      })
    })

    it('resize --scroll with no size sets the key', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--scroll',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({ scroll: true })
    })

    it('resize --no-scroll clears it', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--scroll')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--no-scroll',
      )

      expect(result.json().data).toMatchObject({ scroll: false })
    })

    it('resize with no size and no flag fails usage, exit 2', async () => {
      const run = on('basic')

      const result = await run('frame', 'resize', 'webapp/home/hero')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('fit refuses fit-scroll, exit 10, ahead of launching a browser', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--scroll')

      const result = await run('frame', 'fit', 'webapp/home/hero')

      expect(result.exitCode).toBe(10)
      expect(result.json().error?.code).toBe('fit-scroll')
    })
  })

  describe('widths', () => {
    it('add --widths writes each width beside the frame', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing',
        '--size',
        'desktop',
        '--widths',
        '834,390',
      )

      expect(result.json().data).toMatchObject({
        widths: [
          { width: 834, height: 1194 },
          { width: 390, height: 844 },
        ],
      })
    })

    it.each([
      [
        'a width that is not a number',
        ['--size', 'desktop', '--widths', '834,wide'],
      ],
      ['a zero width', ['--size', 'desktop', '--widths', '0']],
      ['a repeated width', ['--size', 'desktop', '--widths', '390,390']],
      ['its own width', ['--size', 'desktop', '--widths', '1440']],
      ['a frame hugging its width', ['--widths', '390']],
    ])('add refuses %s, exit 2', async (_, args) => {
      const run = on('basic')

      const result = await run('frame', 'add', 'webapp/home/pricing', ...args)

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('resize --no-widths clears the list', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--widths', '390')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--no-widths',
      )

      expect(result.json().data).toMatchObject({ widths: [] })
    })
  })

  it('lock --off clears the flag', async () => {
    const run = on('basic')
    const locked = await run('frame', 'lock', 'webapp/home/about')
    expect(locked.json().data).toMatchObject({ locked: true })

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

  it.each([
    ['iphone-16', 393, 852],
    ['phone', 390, 844],
    ['tablet', 834, 1194],
    ['desktop', 1440, 900],
    ['slide-16-9', 1920, 1080],
    ['slide-4-3', 1024, 768],
    ['og-card', 1200, 630],
    ['linkedin-post', 1200, 627],
    ['video-portrait', 1080, 1920],
  ])('add --size %s places %i x %i', async (size, width, height) => {
    const run = on('basic')

    const result = await run(
      'frame',
      'add',
      'webapp/home/pricing',
      '--size',
      size,
    )

    expect(result.json().data).toMatchObject({ box: { width, height } })
  })

  describe('transition', () => {
    it('answers the frame with the override it set', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'push',
        '--direction',
        'down',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toHaveProperty('transition', {
        name: 'push',
        direction: 'down',
      })
    })

    it('answers the frame with no override after page', async () => {
      const run = on('basic')
      await run('frame', 'transition', 'webapp/home/about', 'zoom')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'page',
      )

      expect(result.json().data).not.toHaveProperty('transition')
    })

    it('refuses an unknown transition with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'cube',
      )

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })
  })

  describe('device', () => {
    it('answers the frame with the device it set', async () => {
      const run = on('basic')

      const result = await run('frame', 'device', 'webapp/home/about', 'phone')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        ref: 'webapp/home/about',
        device: 'phone',
      })
    })

    it('answers the frame with no device after none', async () => {
      const run = on('basic')
      await run('frame', 'device', 'webapp/home/about', 'tablet')

      const result = await run('frame', 'device', 'webapp/home/about', 'none')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).not.toHaveProperty('device')
    })

    it('refuses an unknown device with usage, exit 2, writing nothing', async () => {
      const run = on('basic')
      const layout = join(board.root, 'webapp/home/layout.json')
      const bytes = readFileSync(layout, 'utf8')

      const result = await run('frame', 'device', 'webapp/home/about', 'watch')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
      expect(readFileSync(layout, 'utf8')).toBe(bytes)
    })

    it('add --device places the frame in that device', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing',
        '--size',
        'phone',
        '--device',
        'phone',
      )

      expect(result.json().data).toMatchObject({ device: 'phone' })
    })
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
