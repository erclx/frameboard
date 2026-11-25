import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import type { ServerMessage } from '@/shared/live-messages'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type RunningServer, startServer } from './start'

// Refuses at once, so no spec here starts Chromium.
async function noBrowser(): Promise<never> {
  throw new Error('No browser in this spec.')
}

const FRAMES = ['home/hero', 'home/mobile', 'pricing/plans']

describe('startServer, a project renamed', { timeout: 15_000 }, () => {
  let clientDir: string
  let board: FixtureBoard
  let server: RunningServer
  let tab: WebSocket
  let received: ServerMessage[]
  let launch: typeof noBrowser

  beforeEach(async () => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    board = copyFixtureBoard('live')
    launch = noBrowser
    server = await startServer({
      clientDir,
      facesDir: clientDir,
      root: board.root,
      port: 0,
      openUrl: () => {},
      launch: () => launch(),
    })
    received = []
    tab = new WebSocket(`ws://127.0.0.1:${server.port}/api/live`)
    tab.on('message', (data) => received.push(JSON.parse(String(data))))
    await new Promise((resolve) => tab.once('open', resolve))
    tab.send(JSON.stringify({ type: 'hello', role: 'board', patches: true }))
    await expect
      .poll(
        () =>
          new Set(
            received.flatMap((message) =>
              message.type === 'findings' ? Object.keys(message.findings) : [],
            ),
          ).size,
        { timeout: 5000 },
      )
      .toBe(FRAMES.length)
  })

  afterEach(async () => {
    tab.terminate()
    await server.close()
    board.cleanup()
    rmSync(clientDir, { recursive: true, force: true })
  })

  /** Every frame a batch made stale, which it sends after any reload it makes. */
  const stale = () =>
    new Set(
      received.flatMap((message) =>
        message.type === 'thumbnails' ? Object.keys(message.stamps) : [],
      ),
    )
  const reloads = () =>
    received.flatMap((message) =>
      message.type === 'reload' ? message.refs : [],
    )
  const renames = () => received.filter((message) => message.type === 'renamed')
  const moved = (project: string) =>
    new Set(FRAMES.map((frame) => `${project}/${frame}`))

  it('on disk sends its rename, then a patch of names alone, and reloads no frame', async () => {
    renameSync(join(board.root, 'studio'), join(board.root, 'atelier'))

    await expect.poll(stale, { timeout: 5000 }).toEqual(moved('atelier'))
    const renamed = received.findIndex((message) => message.type === 'renamed')
    expect(received.slice(renamed, renamed + 2)).toEqual([
      { type: 'renamed', before: 'studio', after: 'atelier' },
      {
        type: 'patch',
        data: expect.objectContaining({ projects: ['atelier'] }),
      },
    ])
    expect(renames()).toHaveLength(1)
    expect(reloads()).toEqual([])
  })

  it('on disk reloads only the frame edited beside its rename', async () => {
    renameSync(join(board.root, 'studio'), join(board.root, 'atelier'))
    writeFileSync(join(board.root, 'atelier/home/hero.html'), '<p>new</p>')

    await expect.poll(stale, { timeout: 5000 }).toEqual(moved('atelier'))
    await expect
      .poll(() => new Set(reloads()), { timeout: 5000 })
      .toEqual(new Set(['atelier/home/hero']))
  })

  it('by the board while a batch measures reloads only the frame that batch named', async () => {
    const token = 'c'.repeat(64)
    server.authorize(token)
    const layout = join(board.root, 'studio/home/layout.json')
    const file = JSON.parse(readFileSync(layout, 'utf8'))
    file.frames.hero.hugHeight = true
    writeFileSync(layout, JSON.stringify(file))
    await expect
      .poll(
        () =>
          received.some(
            (message) =>
              message.type === 'patch' &&
              JSON.stringify(message).includes('"hugHeight":true'),
          ),
        { timeout: 5000 },
      )
      .toBe(true)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const measuring = new Promise<void>((resolve) => {
      launch = async () => {
        resolve()
        await held
        return noBrowser()
      }
    })
    received = []

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>new</p>')
    await measuring
    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/project/rename`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ ref: 'studio', name: 'atelier' }),
      },
    )
    release()

    expect(response.status).toBe(200)
    await expect.poll(stale, { timeout: 5000 }).toEqual(moved('atelier'))
    expect(renames()).toHaveLength(1)
    const patched = received.flatMap((message) =>
      message.type === 'patch'
        ? message.data.projects.map((each) =>
            typeof each === 'string' ? each : each.name,
          )
        : [],
    )
    expect(new Set(patched)).toEqual(new Set(['atelier']))
    expect(new Set(reloads())).toEqual(new Set(['atelier/home/hero']))
  })
})
