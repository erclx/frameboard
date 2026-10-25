import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { newAddress, writeAddress } from '@/server/address'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

interface OpenData {
  url: string
  writeUrl: string
  expiresAt: string
  opened: boolean
}

describe('open', { timeout: 15_000 }, () => {
  let board: FixtureBoard
  let stop: AbortController

  beforeEach(() => {
    board = copyFixtureBoard('live')
    stop = new AbortController()
  })

  afterEach(async () => {
    stop.abort()
    // Let the aborted server remove its address file and close.
    await new Promise((resolve) => setImmediate(resolve))
    board.cleanup()
  })

  function open(...flags: string[]) {
    return cli(['open', '--root', board.root, ...flags], { cwd: board.root })
  }

  async function serve(): Promise<string> {
    const run = await cli(
      ['serve', '--json', '--no-open', '--port', '0', '--root', board.root],
      { cwd: board.root, signal: stop.signal },
    )
    return (run.json().data as { url: string }).url
  }

  function token(): string {
    return JSON.parse(
      readFileSync(join(board.root, '.run', 'address.json'), 'utf8'),
    ).token
  }

  it('exits 3 with server-not-running and opens nothing when no server serves the board', async () => {
    const run = await open('--json')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('server-not-running')
    expect(run.opened).toEqual([])
  })

  it('exits 3 with server-not-running on an address file whose pid is dead', async () => {
    await writeAddress(
      board.root,
      newAddress({
        root: board.root,
        host: '127.0.0.1',
        port: 1,
        pid: 2 ** 22 + 1,
      }),
    )

    const run = await open('--json')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('server-not-running')
  })

  it('opens a redeem URL that writes once, and names when it stops', async () => {
    const url = await serve()

    const run = await open('--json')
    const data = run.json().data as OpenData

    expect(run.exitCode).toBe(0)
    expect(data.url).toBe(url)
    expect(data.writeUrl).toMatch(
      new RegExp(`^${url}/api/access/redeem\\?ticket=[0-9a-f]{32}$`),
    )
    expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now())
    expect(data.opened).toBe(true)
    expect(run.opened).toEqual([data.writeUrl])

    const first = await fetch(data.writeUrl, { redirect: 'manual' })
    const second = await fetch(data.writeUrl, { redirect: 'manual' })
    expect(first.headers.get('set-cookie')).not.toBeNull()
    expect(second.headers.get('location')).toBe('/?link=expired')
  })

  it('opens nothing under --no-open and still hands back the redeem URL', async () => {
    await serve()

    const run = await open('--no-open', '--json')
    const data = run.json().data as OpenData

    expect(data.opened).toBe(false)
    expect(data.writeUrl).toContain('/api/access/redeem?ticket=')
    expect(run.opened).toEqual([])
  })

  it.each([[['--json']], [['--no-open']]])(
    'never prints the address token under %j',
    async (flags) => {
      await serve()

      const run = await open(...flags)

      expect(run.exitCode).toBe(0)
      expect(run.stdout).not.toContain(token())
      expect(run.stderr).not.toContain(token())
    },
  )
})
