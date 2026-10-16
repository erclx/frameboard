import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { cli } from '../../../test/support/cli'

describe('serve', () => {
  let cwd: string
  let stops: AbortController[]

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-serve-')))
    stops = []
  })

  afterEach(async () => {
    for (const stop of stops) stop.abort()
    // Let each aborted server remove its address file and close.
    await new Promise((resolve) => setImmediate(resolve))
    rmSync(cwd, { recursive: true, force: true })
  })

  function serve(...argv: string[]) {
    const stop = new AbortController()
    stops.push(stop)
    return cli(['serve', '--json', '--port', '0', ...argv], {
      cwd,
      signal: stop.signal,
    })
  }

  it('starts a board in an empty folder and records its address', async () => {
    const run = await serve('--no-open')

    expect(run.exitCode).toBe(0)
    expect(run.json().data).toMatchObject({
      root: join(cwd, '.frameboard'),
      reused: false,
      created: true,
      opened: false,
    })
    expect(readdirSync(join(cwd, '.frameboard/untitled/page-1'))).toEqual([])
    expect(existsSync(join(cwd, '.frameboard/.run/address.json'))).toBe(true)
  })

  it('reuses a live server for the same board without binding', async () => {
    const first = await serve('--no-open')

    const second = await serve('--no-open')

    expect(second.json().data).toMatchObject({
      url: (first.json().data as { url: string }).url,
      reused: true,
      created: false,
      opened: false,
    })
  })

  it('has a reused server open the board when no tab is connected to it', async () => {
    const first = await serve('--no-open')

    const second = await serve()

    expect(second.json().data).toMatchObject({ reused: true, opened: true })
    expect(first.opened).toEqual([(first.json().data as { url: string }).url])
    expect(second.opened).toEqual([])
  })

  it('opens nothing through a reused server with a board tab connected', async () => {
    const first = await serve('--no-open')
    const url = (first.json().data as { url: string }).url
    const tab = new WebSocket(`${url.replace('http', 'ws')}/api/live`)
    await new Promise((resolve) => tab.once('open', resolve))
    const snapshot = new Promise((resolve) => tab.once('message', resolve))
    tab.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await snapshot

    const second = await serve()
    tab.terminate()

    expect(second.json().data).toMatchObject({ reused: true, opened: false })
    expect(first.opened).toEqual([])
  })

  it('opens the board when no tab reconnects within the wait', async () => {
    const run = await serve()

    expect(run.json().data).toMatchObject({ opened: true })
    expect(run.opened).toEqual([(run.json().data as { url: string }).url])
  })

  it('removes its address file when stopped', async () => {
    await serve('--no-open')
    const stop = stops[0]

    stop?.abort()
    await expect
      .poll(() => existsSync(join(cwd, '.frameboard/.run/address.json')))
      .toBe(false)
  })
})
