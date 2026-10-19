import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

describe('show', () => {
  let board: FixtureBoard
  let stop: AbortController
  let sockets: WebSocket[]

  beforeEach(() => {
    board = copyFixtureBoard('live')
    stop = new AbortController()
    sockets = []
  })

  afterEach(async () => {
    for (const socket of sockets) socket.terminate()
    stop.abort()
    // Let the aborted server remove its address file and close.
    await new Promise((resolve) => setImmediate(resolve))
    board.cleanup()
  })

  function show(ref: string) {
    return cli(['show', ref, '--json', '--root', board.root], {
      cwd: board.root,
    })
  }

  async function serve(): Promise<string> {
    const run = await cli(
      ['serve', '--json', '--no-open', '--port', '0', '--root', board.root],
      { cwd: board.root, signal: stop.signal },
    )
    return (run.json().data as { url: string }).url
  }

  async function openTab(url: string): Promise<ServerMessage[]> {
    const messages: ServerMessage[] = []
    const socket = new WebSocket(`${url.replace('http', 'ws')}/api/live`)
    sockets.push(socket)
    socket.on('message', (data) => messages.push(JSON.parse(String(data))))
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board' }))
    // The board, whether it may write, the history, the claims, the changes, the listeners, then every frame's findings.
    await expect.poll(() => messages.length).toBe(7)
    return messages
  }

  it('exits 3 with server-not-running when no server serves the board', async () => {
    const run = await show('home/hero')

    expect(run.exitCode).toBe(3)
    expect(run.json()).toMatchObject({
      ok: false,
      error: { code: 'server-not-running' },
    })
  })

  it('exits 3 with frame-not-found before asking any server', async () => {
    await serve()

    const run = await show('home/missing')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
  })

  it('points every open board tab at the frame', async () => {
    const url = await serve()
    const messages = await openTab(url)

    const run = await show('studio/pricing/plans')

    expect(run.exitCode).toBe(0)
    expect(run.json().data).toEqual({
      ref: 'studio/pricing/plans',
      url: `${url}/p/studio/pricing`,
      tabs: 1,
    })
    await expect
      .poll(() => messages.at(-1))
      .toEqual({ type: 'show', ref: 'studio/pricing/plans' })
  })

  it('reports no tabs told when the board is not open anywhere', async () => {
    await serve()

    const run = await show('home/hero')

    expect(run.json().data).toMatchObject({ ref: 'studio/home/hero', tabs: 0 })
  })
})
