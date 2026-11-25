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
import type { Folders } from './project-folders'

/** A tab's end of the socket, holding the board the messages make. */
interface Tab {
  socket: WebSocket
  board: () => ListResult | null
  received: ServerMessage[]
}

const home = (...names: string[]) =>
  boardOf(pageOf(names.map((name) => frameOf(name))))

/** A board of projects by name, each with the one home page. */
function projectsOf(...names: string[]): ListResult {
  const { root, projects } = home('hero')
  return {
    root,
    projects: names.map((name) => ({
      ...(projects[0] as ListResult['projects'][number]),
      name,
    })),
  }
}

describe('createBoardFeed', () => {
  let server: Server
  let hub: LiveHub
  let tabs: BoardTabs
  let feed: BoardFeed
  let sockets: WebSocket[]
  let port: number
  /** The board on disk, which every scan reads. */
  let disk: ListResult
  /** The identity of each project folder on disk, none for one left out. */
  let ids: Record<string, string>
  /** The renames found on disk, as the feed's caller hears them. */
  let found: [string, string][]
  /** What crosses the next scan, run once it holds what it read. */
  let crossing: (() => void) | undefined
  /** What a hello's scan waits on, so a test can hold it in its turn. */
  let turn: Promise<void>

  beforeEach(async () => {
    sockets = []
    tabs = new BoardTabs()
    disk = home('hero')
    ids = { studio: 's' }
    found = []
    crossing = undefined
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
        await feed.join(await feed.scan(), deliver)
      },
    })
    feed = createBoardFeed(hub, {
      look: async () => {
        const board = disk
        const folders: Folders = new Map(
          board.projects.map(({ name }) => [name, ids[name] ?? null]),
        )
        crossing?.()
        crossing = undefined
        return { board, folders }
      },
      onFound: (before, after) => found.push([before, after]),
    })
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

  /** Scans `board` from disk and pushes it, as a batch does. */
  async function push(board: ListResult): Promise<void> {
    disk = board
    await feed.push(await feed.scan())
  }

  /** What `tab` was told past its board, a patch as its projects with a star on each that moved. */
  const told = (tab: Tab) =>
    tab.received.flatMap((message) => {
      if (message.type === 'renamed') {
        return [`${message.before} > ${message.after}`]
      }
      if (message.type !== 'patch') return []
      return [
        message.data.projects
          .map((each) => (typeof each === 'string' ? each : `${each.name}*`))
          .join(' '),
      ]
    })

  it('sends a joined tab a patch of what a push changed', async () => {
    const tab = await joined()

    await push(home('hero', 'about'))

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

    await push(home('hero'))

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
    await push(disk)
    scanned()
    await expect
      .poll(() => tab.received.map((message) => message.type))
      .toContain('access')
    await push(home('hero', 'about', 'pricing'))

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
    await push(disk)
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

  /** The board's own rename of the one project, written and announced. */
  function renameStudio(): void {
    disk = renameOnBoard(disk, 'studio', 'atelier')
    ids = { atelier: 's' }
    feed.rename('studio', 'atelier')
  }

  it('scans again ahead of a push when a rename overtook its scan', async () => {
    const tab = await joined()
    disk = home('hero', 'about')
    crossing = renameStudio

    const sent = await feed.push(await feed.scan())

    await settled(tab)
    expect(sent).toBe(disk)
    expect(told(tab)).toEqual(['studio > atelier', 'atelier*'])
    expect(tab.board()).toEqual(disk)
  })

  it('scans again ahead of a hello when a rename overtook its scan', async () => {
    const first = await joined()
    crossing = renameStudio

    const second = await open()
    await expect
      .poll(() => second.received.map((message) => message.type))
      .toContain('access')

    await settled(first)
    expect(told(first)).toEqual(['studio > atelier'])
    expect(second.board()).toEqual(disk)
  })

  describe('a project renamed outside the board', () => {
    it('is announced ahead of the patch of the push that finds it', async () => {
      const tab = await joined()

      ids = { atelier: 's' }
      await push(renameOnBoard(disk, 'studio', 'atelier'))

      expect((await settled(tab)).slice(-2)).toEqual([
        { type: 'renamed', before: 'studio', after: 'atelier' },
        { type: 'patch', data: { root: '/board', projects: ['atelier'] } },
      ])
      expect(found).toEqual([['studio', 'atelier']])
    })

    it('is announced to the tabs already joined by the hello that finds it', async () => {
      const first = await joined()
      disk = renameOnBoard(disk, 'studio', 'atelier')
      ids = { atelier: 's' }

      const second = await open()
      await expect
        .poll(() => second.received.map((message) => message.type))
        .toContain('access')
      await push(disk)

      await settled(first)
      expect(told(first)).toEqual(['studio > atelier', 'atelier'])
      expect(first.board()).toEqual(disk)
      expect(second.board()).toEqual(disk)
    })

    it('is announced once when history announces it after the push that found it', async () => {
      const tab = await joined()

      ids = { atelier: 's' }
      await push(renameOnBoard(disk, 'studio', 'atelier'))
      feed.rename('studio', 'atelier')
      await push(disk)

      await settled(tab)
      expect(told(tab)).toEqual(['studio > atelier', 'atelier', 'atelier'])
    })

    it('is announced from the name the board gave it last', async () => {
      const tab = await joined()

      feed.rename('studio', 'atelier')
      ids = { workshop: 's' }
      await push(renameOnBoard(disk, 'studio', 'workshop'))

      await settled(tab)
      expect(told(tab)).toEqual([
        'studio > atelier',
        'atelier > workshop',
        'workshop',
      ])
      expect(found).toEqual([['atelier', 'workshop']])
    })

    it('is announced by the batch after one that lost sight of its folder', async () => {
      const tab = await joined()

      ids = {}
      await push(disk)
      ids = { atelier: 's' }
      await push(renameOnBoard(disk, 'studio', 'atelier'))

      await settled(tab)
      expect(found).toEqual([['studio', 'atelier']])
    })

    it('is announced in the order that frees each name', async () => {
      disk = projectsOf('a', 'c')
      ids = { a: '1', c: '3' }
      const tab = await joined()

      ids = { a: '3', b: '1' }
      await push(projectsOf('a', 'b'))

      await settled(tab)
      expect(told(tab).slice(0, 2)).toEqual(['a > b', 'c > a'])
    })

    it('is left to the patch when two projects swapped names', async () => {
      disk = projectsOf('a', 'b')
      ids = { a: '1', b: '2' }
      const tab = await joined()

      ids = { a: '2', b: '1' }
      await push(projectsOf('a', 'b'))

      await settled(tab)
      expect(told(tab)).toEqual(['a b'])
      expect(found).toEqual([])
    })
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
      await push(after)

      await settled(tab)
      expect(tab.board()).toEqual(after)
    },
  )

  it('sends a patch of names alone for a batch that only carries a rename', async () => {
    const tab = await joined()

    feed.rename('studio', 'atelier')
    await push(renameOnBoard(disk, 'studio', 'atelier'))

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
    await push(disk)
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
