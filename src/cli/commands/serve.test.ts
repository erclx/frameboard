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
import WebSocket from 'ws'

import { cli } from '../../../test/support/cli'

const REDEEM_URL =
  /^http:\/\/127\.0\.0\.1:\d+\/api\/access\/redeem\?ticket=[0-9a-f]{32}$/

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
    expect(first.opened).toEqual([expect.stringMatching(REDEEM_URL)])
    expect(second.opened).toEqual([])
  })

  async function connectTab(url: string, headers: Record<string, string>) {
    const tab = new WebSocket(`${url.replace('http', 'ws')}/api/live`, {
      headers,
    })
    await new Promise((resolve) => tab.once('open', resolve))
    const snapshot = new Promise((resolve) => tab.once('message', resolve))
    tab.send(JSON.stringify({ type: 'hello', role: 'board' }))
    await snapshot
    return tab
  }

  it('opens nothing through a reused server with a writing tab connected', async () => {
    const first = await serve('--no-open')
    const url = (first.json().data as { url: string }).url
    const { token } = JSON.parse(
      readFileSync(join(cwd, '.frameboard/.run/address.json'), 'utf8'),
    )
    const tab = await connectTab(url, { authorization: `Bearer ${token}` })

    const second = await serve()
    tab.terminate()

    expect(second.json().data).toMatchObject({ reused: true, opened: false })
    expect(first.opened).toEqual([])
  })

  it('opens a tab through a reused server when only a reader is connected', async () => {
    const first = await serve('--no-open')
    const url = (first.json().data as { url: string }).url
    const tab = await connectTab(url, {})

    const second = await serve()
    tab.terminate()

    expect(second.json().data).toMatchObject({ reused: true, opened: true })
    expect(first.opened).toEqual([expect.stringMatching(REDEEM_URL)])
  })

  it('opens the board when no tab reconnects within the wait', async () => {
    const run = await serve()

    expect(run.json().data).toMatchObject({ opened: true })
    expect(run.opened).toEqual([expect.stringMatching(REDEEM_URL)])
  })

  it('keeps the ticket and the key out of the envelope', async () => {
    const run = await serve()
    const { key } = JSON.parse(
      readFileSync(join(cwd, '.frameboard/.run/board-key.json'), 'utf8'),
    )
    const [opened] = run.opened
    const ticket = new URL(opened ?? '').searchParams.get('ticket') ?? ''

    expect(ticket).not.toBe('')
    expect(run.stdout).not.toContain(ticket)
    expect(run.stdout).not.toContain(key)
  })

  describe('--tokens', () => {
    beforeEach(() => {
      mkdirSync(join(cwd, 'brand'))
      writeFileSync(join(cwd, 'brand/tokens.css'), ':root { --fg: teal }')
    })

    it('resolves a relative sheet against the working folder and records it', async () => {
      const run = await serve('--no-open', '--tokens', 'brand/tokens.css')

      const sheet = join(cwd, 'brand/tokens.css')
      expect(run.json().data).toMatchObject({ reused: false, tokens: sheet })
      expect(
        JSON.parse(
          readFileSync(join(cwd, '.frameboard/.run/address.json'), 'utf8'),
        ),
      ).toMatchObject({ tokens: sheet })
    })

    it('refuses a sheet that does not exist and starts nothing', async () => {
      const run = await serve('--no-open', '--tokens', 'missing.css')

      expect(run.exitCode).toBe(3)
      expect(run.json()).toMatchObject({
        ok: false,
        error: { code: 'tokens-not-found' },
      })
      expect(existsSync(join(cwd, '.frameboard'))).toBe(false)
    })

    it("reports the running server's sheet on a reuse given another one", async () => {
      await serve('--no-open', '--tokens', 'brand/tokens.css')
      writeFileSync(join(cwd, 'other.css'), ':root {}')

      const second = await serve('--no-open', '--tokens', 'other.css')

      expect(second.json().data).toMatchObject({
        reused: true,
        tokens: join(cwd, 'brand/tokens.css'),
      })
    })

    it('reports no sheet when none was given', async () => {
      const run = await serve('--no-open')

      expect(run.json().data).toMatchObject({ tokens: null })
    })
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
