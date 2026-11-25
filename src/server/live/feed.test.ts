import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { applyPatch } from '@/shared/board-sync/patch'
import { renameOnBoard, takesRename } from '@/shared/board-sync/rename'
import type { ServerMessage } from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { BoardTabs } from '../start'
import { type BoardFeed, createBoardFeed } from './feed'
import { createHub, type LiveHub } from './hub'

/** A tab's end of the socket, holding the board the messages make. */
interface Tab {
  socket: WebSocket
  board: () => ListResult | null
  received: ServerMessage[]
}

const home = (...names: string[]) =>
  boardOf(pageOf(names.map((name) => frameOf(name))))

describe('createBoardFeed', () => {
  let server: Server
  let hub: LiveHub
  let tabs: BoardTabs
  let feed: BoardFeed
  let sockets: WebSocket[]
  let port: number
  /** The board on disk, which a hello scans. */
  let disk: ListResult
  /** What a hello's scan waits on, so a test can hold it in its turn. */
  let turn: Promise<void>

  beforeEach(async () => {
    sockets = []
    tabs = new BoardTabs()
    disk = home('hero')
    turn = Promise.resolve()
    server = createServer()
    hub = createHub({
      tabs,
      port: () => port,
      access: {
        token: () => null,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => true,
      },
      snapshot: async (deliver) => {
        await turn
        feed.join(disk, deliver)
      },
    })
    feed = createBoardFeed(hub)
    server.on('upgrade', hub.handleUpgrade)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    for (const socket of sockets) socket.terminate()
    await hub.close()
    await new Promise((resolve) => server.close(resolve))
  })

  async function open(): Promise<Tab> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/live`)
    sockets.push(socket)
    let held: ListResult | null = null
    const received: ServerMessage[] = []
    socket.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage
      received.push(message)
      if (message.type === 'board') held = message.data
      if (message.type === 'patch') {
        held = held && applyPatch(held, message.data)
        if (!held) throw new Error('a patch did not apply')
      }
      if (message.type === 'renamed') {
        const { before, after } = message
        if (held && takesRename(held, before, after)) {
          held = renameOnBoard(held, before, after)
        }
      }
    })
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', role: 'board', patches: true }))
    return { socket, received, board: () => held }
  }

  /** A tab whose hello has been answered in full. */
  async function joined(): Promise<Tab> {
    const tab = await open()
    await expect
      .poll(() => tab.received.map((message) => message.type))
      .toEqual(['board', 'access'])
    return tab
  }

  /** Every message sent so far, read once a later one of its own type lands. */
  async function settled(tab: Tab): Promise<ServerMessage[]> {
    hub.broadcast({ type: 'show', ref: 'settled' })
    await expect.poll(() => tab.received.at(-1)?.type).toBe('show')
    return tab.received.slice(0, -1)
  }

  it('sends a joined tab a patch of what a push changed', async () => {
    const tab = await joined()

    feed.push(home('hero', 'about'))

    const sent = (await settled(tab)).at(-1)
    expect(sent).toEqual({
      type: 'patch',
      data: {
        ...home('hero'),
        projects: [
          {
            ...home('hero').projects[0],
            pages: [{ ...pageOf([]), frames: ['hero', frameOf('about')] }],
          },
        ],
      },
    })
    expect(tab.board()).toEqual(home('hero', 'about'))
  })

  it('sends a patch of names alone for a push that changed nothing', async () => {
    const tab = await joined()

    feed.push(home('hero'))

    expect((await settled(tab)).at(-1)).toEqual({
      type: 'patch',
      data: { root: '/board', projects: ['studio'] },
    })
  })

  it('brings a tab that says hello while a batch scans onto the board it pushes', async () => {
    let scanned = () => {}
    turn = new Promise((resolve) => {
      scanned = resolve
    })
    const tab = await open()
    await expect.poll(() => tabs.count).toBe(1)

    disk = home('hero', 'about')
    feed.push(disk)
    scanned()
    await expect
      .poll(() => tab.received.map((message) => message.type))
      .toContain('access')
    feed.push(home('hero', 'about', 'pricing'))

    const boards = (await settled(tab))
      .map((message) => message.type)
      .filter((type) => type === 'board' || type === 'patch')
    expect(boards.at(0)).toBe('board')
    expect(boards.at(-1)).toBe('patch')
    expect(tab.board()).toEqual(home('hero', 'about', 'pricing'))
  })

  it('sends the tabs already joined what a hello found ahead of its batch', async () => {
    const first = await joined()
    disk = home('hero', 'about')

    const second = await joined()

    expect((await settled(first)).at(-1)?.type).toBe('patch')
    feed.push(disk)
    await settled(first)
    expect(first.board()).toEqual(disk)
    expect(second.board()).toEqual(disk)
  })

  it('sends the tabs already joined nothing for a hello that found no change', async () => {
    const first = await joined()

    await joined()

    expect((await settled(first)).map((message) => message.type)).toEqual([
      'board',
      'access',
    ])
  })

  it('brings a tab back from a rename between a batch scan and its push', async () => {
    const tab = await joined()
    const scanned = home('hero', 'about')

    feed.rename('studio', 'atelier')
    feed.push(scanned)
    const renamed = renameOnBoard(scanned, 'studio', 'atelier')
    feed.push(renamed)

    await settled(tab)
    expect(tab.board()).toEqual(renamed)
  })

  it.each<[string, [string, string][]]>([
    [
      'two renames',
      [
        ['studio/home', 'studio/start'],
        ['studio', 'atelier'],
      ],
    ],
    [
      'a rename and its undo',
      [
        ['studio', 'atelier'],
        ['atelier', 'studio'],
      ],
    ],
    ['a frame renamed', [['studio/home/hero', 'studio/home/lead']]],
  ])(
    'keeps a tab on the board through %s ahead of one batch',
    async (_, renames) => {
      const tab = await joined()
      let after = disk

      for (const [from, to] of renames) {
        feed.rename(from, to)
        after = renameOnBoard(after, from, to)
      }
      feed.push(after)

      await settled(tab)
      expect(tab.board()).toEqual(after)
    },
  )

  it('sends a patch of names alone for a batch that only carries a rename', async () => {
    const tab = await joined()

    feed.rename('studio', 'atelier')
    feed.push(renameOnBoard(disk, 'studio', 'atelier'))

    expect((await settled(tab)).slice(-2)).toEqual([
      { type: 'renamed', before: 'studio', after: 'atelier' },
      { type: 'patch', data: { root: '/board', projects: ['atelier'] } },
    ])
  })

  it('brings a tab that asked again onto the board, with no patch on its stale one', async () => {
    const tab = await joined()
    let scanned = () => {}
    turn = new Promise((resolve) => {
      scanned = resolve
    })

    tab.socket.send(JSON.stringify({ type: 'resync' }))
    const pinged = new Promise((resolve) => tab.socket.once('pong', resolve))
    tab.socket.ping()
    await pinged
    disk = home('hero', 'about')
    feed.push(disk)
    scanned()

    await expect
      .poll(
        () => tab.received.filter((message) => message.type === 'board').length,
      )
      .toBe(3)
    expect((await settled(tab)).map((message) => message.type)).not.toContain(
      'patch',
    )
    expect(tab.board()).toEqual(disk)
  })
})
