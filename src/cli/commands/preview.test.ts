import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PreviewStart } from '@/shared/records/preview'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { terminalCode } from './preview'

describe('preview', { timeout: 15_000 }, () => {
  let board: FixtureBoard
  let stop: AbortController

  beforeEach(() => {
    board = copyFixtureBoard('live')
    stop = new AbortController()
  })

  afterEach(async () => {
    stop.abort()
    // Let the aborted server close its listeners and remove its address file.
    await new Promise((resolve) => setImmediate(resolve))
    board.cleanup()
  })

  function preview(...args: string[]) {
    return cli(['preview', '--root', board.root, ...args], { cwd: board.root })
  }

  async function serve(): Promise<void> {
    await cli(
      ['serve', '--json', '--no-open', '--port', '0', '--root', board.root],
      { cwd: board.root, signal: stop.signal },
    )
  }

  /** The link's path, which names the board's frame whatever address the machine holds. */
  function linkPath(url: string): string {
    return new URL(url).pathname
  }

  it('exits 3 with server-not-running when no server serves the board', async () => {
    const run = await preview('studio/home/hero', '--json')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('server-not-running')
  })

  it('exits 2 with usage when given neither a frame nor --stop', async () => {
    const run = await preview('--json')

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })

  it('exits 3 with frame-not-found for a frame the board does not hold', async () => {
    const run = await preview('studio/home/missing', '--json')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
  })

  it('prints one JSON document holding a link that lands on the frame', async () => {
    await serve()

    const run = await preview('studio/home/hero', '--port', '0', '--json')

    expect(run.exitCode).toBe(0)
    const data = run.json().data as PreviewStart
    expect(data.ref).toBe('studio/home/hero')
    expect(linkPath(data.url)).toBe(
      `/v/${data.token}/frames/studio/home/hero.html`,
    )
    const local = `http://127.0.0.1:${data.port}${linkPath(data.url)}`
    expect((await fetch(local)).status).toBe(200)
  })

  it('ends the link with --stop', async () => {
    await serve()
    const started = (
      await preview('studio/home/hero', '--port', '0', '--json')
    ).json().data as PreviewStart

    const run = await preview('--stop', '--json')

    expect(run.json().data).toEqual({ stopped: true })
    const local = `http://127.0.0.1:${started.port}${linkPath(started.url)}`
    await expect(fetch(local)).rejects.toThrow()
  })
})

describe('terminalCode', () => {
  it('draws two module rows to a line, with the quiet zone around them', () => {
    const code = terminalCode([
      [true, false],
      [false, true],
    ])

    const lines = code.split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[2]).toBe('\x1b[30;47m    ▀▄    \x1b[0m')
  })
})
