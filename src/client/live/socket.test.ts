import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { leftTabStore } from '@/client/board/left-panel/tab-store'
import { createModeStore } from '@/client/board/mode'
import {
  awaitHash,
  createSelectionStore,
  followSelection,
  forgetLiveHashes,
  rememberLiveHash,
  select,
  selectElement,
  whenSettled,
} from '@/client/board/selection'
import { pinnedProjects, togglePin } from '@/client/home/pins'
import { createThemeStore, flipFrame } from '@/client/theme/store'
import { patchBetween } from '@/shared/board-sync/patch'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { connectLive, receiveLiveReload } from './socket'
import { createLiveStore, type LiveStore } from './store'
import { createUnseenStore } from './unseen'

/** A socket the test drives by hand, standing in for the server's end. */
class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = []
  sent: string[] = []

  constructor() {
    super()
    FakeSocket.instances.push(this)
  }

  send(text: string): void {
    this.sent.push(text)
  }

  close(): void {}

  receive(message: unknown): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) }),
    )
  }
}

function boardWithHome() {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        createdAt: null,
        projectFileError: null,
        pages: [
          {
            ref: 'studio/home',
            project: 'studio',
            name: 'home',
            path: '/board/studio/home',
            index: 0,
            layoutError: null,
            frames: [],
          },
        ],
      },
    ],
  }
}

describe('connectLive access', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows the access message and falls back to read-only when the socket drops', () => {
    const store = createLiveStore()
    const stop = connectLive(store)
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))

    expect(store.getState().canWrite).toBe(false)

    socket?.receive({ type: 'access', write: true, dispatch: false })
    expect(store.getState().canWrite).toBe(true)

    socket?.dispatchEvent(new Event('close'))
    expect(store.getState().canWrite).toBe(false)
    stop()
  })

  it('follows whether a note can start a session and clears it when the socket drops', () => {
    const store = createLiveStore()
    const stop = connectLive(store)
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))

    socket?.receive({ type: 'access', write: true, dispatch: true })
    expect(store.getState().dispatch).toBe(true)

    socket?.dispatchEvent(new Event('close'))
    expect(store.getState().dispatch).toBe(false)
    stop()
  })

  it('follows whether a reading tab may ask to edit and clears it when the socket drops', () => {
    const store = createLiveStore()
    const stop = connectLive(store)
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))

    socket?.receive({
      type: 'access',
      write: false,
      dispatch: false,
      editButton: true,
    })
    expect(store.getState().editButton).toBe(true)

    socket?.dispatchEvent(new Event('close'))
    expect(store.getState().editButton).toBe(false)
    stop()
  })

  it('follows the history message and zeroes it when the socket drops', () => {
    const store = createLiveStore()
    const stop = connectLive(store)
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))

    socket?.receive({ type: 'history', undo: 2, redo: 1 })
    expect(store.getState().history).toEqual({ undo: 2, redo: 1 })

    socket?.dispatchEvent(new Event('close'))
    expect(store.getState().history).toEqual({ undo: 0, redo: 0 })
    stop()
  })

  it('renames the page the renamed message names on the board in hand', () => {
    const store = createLiveStore()
    const stop = connectLive(store)
    const socket = FakeSocket.instances[0]
    socket?.receive({ type: 'board', data: boardWithHome() })

    socket?.receive({
      type: 'renamed',
      before: 'studio/home',
      after: 'studio/start',
    })

    expect(store.getState().board?.projects[0]?.pages[0]?.ref).toBe(
      'studio/start',
    )
    stop()
  })

  it('keeps a followed selection and a flip through a renamed message', () => {
    const store = createLiveStore()
    const selection = createSelectionStore()
    const theme = createThemeStore()
    const stop = connectLive(store, { selection, theme })
    const socket = FakeSocket.instances[0]
    socket?.receive({
      type: 'board',
      data: boardOf(pageOf([frameOf('hero')])),
    })
    const unfollow = followSelection(
      selection,
      'studio/home',
      store,
      createModeStore(1280),
    )
    select(selection, 'studio/home', ['studio/home/hero'])
    flipFrame('studio/home/hero', theme)

    socket?.receive({
      type: 'renamed',
      before: 'studio/home',
      after: 'studio/start',
    })

    expect(selection.getState().frames).toEqual(['studio/start/hero'])
    expect(theme.getState().flipped).toEqual(new Set(['studio/start/hero']))
    unfollow()
    stop()
  })

  it('keeps a selected frame, its flip, and its unseen mark through a frame rename', () => {
    const store = createLiveStore()
    const selection = createSelectionStore()
    const theme = createThemeStore()
    const unseen = createUnseenStore(null)
    const stop = connectLive(store, { selection, theme, unseen })
    const socket = FakeSocket.instances[0]
    socket?.receive({
      type: 'board',
      data: boardOf(pageOf([frameOf('hero'), frameOf('footer')])),
    })
    socket?.receive({
      type: 'changes',
      changes: [
        {
          id: 'c1',
          frame: 'studio/home/hero',
          at: '2026-10-19T12:00:00.000Z',
          hash: 'h1',
          author: null,
          elements: [],
          removed: 0,
          whole: true,
          created: true,
        },
      ],
    })
    const unfollow = followSelection(
      selection,
      'studio/home',
      store,
      createModeStore(1280),
    )
    select(selection, 'studio/home', ['studio/home/hero'])
    flipFrame('studio/home/hero', theme)

    socket?.receive({
      type: 'renamed',
      before: 'studio/home/hero',
      after: 'studio/home/lead',
    })

    expect(selection.getState().frames).toEqual(['studio/home/lead'])
    expect(theme.getState().flipped).toEqual(new Set(['studio/home/lead']))
    expect(Object.keys(unseen.getState().unseen)).toEqual(['studio/home/lead'])
    unfollow()
    stop()
  })

  it('keeps a selected element through a rename of its frame', () => {
    const store = createLiveStore()
    const selection = createSelectionStore()
    const stop = connectLive(store, { selection })
    const socket = FakeSocket.instances[0]
    socket?.receive({
      type: 'board',
      data: boardOf(pageOf([frameOf('hero')])),
    })
    const unfollow = followSelection(
      selection,
      'studio/home',
      store,
      createModeStore(1280),
    )
    selectElement(selection, 'studio/home', {
      frame: 'studio/home/hero',
      index: 2,
      hash: 'h1',
    })

    socket?.receive({
      type: 'renamed',
      before: 'studio/home/hero',
      after: 'studio/home/lead',
    })

    expect(selection.getState().element).toEqual({
      frame: 'studio/home/lead',
      index: 2,
      hash: 'h1',
    })
    unfollow()
    stop()
  })

  it('moves nothing for a rename the board already carries', () => {
    const store = createLiveStore()
    const selection = createSelectionStore()
    const stop = connectLive(store, { selection })
    const socket = FakeSocket.instances[0]
    socket?.receive({
      type: 'board',
      data: boardOf(pageOf([], 'start')),
    })
    select(selection, 'studio/start', ['studio/start/hero'])

    socket?.receive({
      type: 'renamed',
      before: 'studio/home',
      after: 'studio/start',
    })

    expect(selection.getState().frames).toEqual(['studio/start/hero'])
    stop()
  })

  describe("the left panel's project", () => {
    beforeEach(() => {
      leftTabStore.setState({ tab: 'assets', project: 'studio' })
    })

    afterEach(() => {
      leftTabStore.setState({ tab: 'design', project: null })
    })

    const heard = (renames: [string, string][]) => {
      const stop = connectLive(createLiveStore())
      const socket = FakeSocket.instances[0]
      socket?.receive({ type: 'board', data: boardWithHome() })
      for (const [before, after] of renames) {
        socket?.receive({ type: 'renamed', before, after })
      }
      stop()
      return leftTabStore.getState().project
    }

    it.each<[string, [string, string][], string]>([
      ['a rename', [['studio', 'atelier']], 'atelier'],
      [
        'a second rename',
        [
          ['studio', 'atelier'],
          ['atelier', 'workshop'],
        ],
        'workshop',
      ],
      [
        'a rename and its undo',
        [
          ['studio', 'atelier'],
          ['atelier', 'studio'],
        ],
        'studio',
      ],
      ['a page rename', [['studio/home', 'studio/start']], 'studio'],
      ["another project's rename", [['shop', 'store']], 'studio'],
    ])('is the one it showed after %s', (_, renames, project) => {
      expect(heard(renames)).toBe(project)
    })
  })

  describe('the home pin', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    function hear(before: string, after: string): void {
      const stop = connectLive(createLiveStore())
      const socket = FakeSocket.instances[0]
      socket?.receive({ type: 'board', data: boardWithHome() })
      socket?.receive({ type: 'renamed', before, after })
      stop()
    }

    it("follows a project's rename", () => {
      togglePin('studio')

      hear('studio', 'atelier')

      expect(pinnedProjects()).toEqual(new Set(['atelier']))
    })

    it.each([
      ['a page', 'studio/home', 'studio/start'],
      ['a frame', 'studio/home/hero', 'studio/home/lead'],
    ])('stays through the rename of %s', (_, before, after) => {
      togglePin('studio')

      hear(before, after)

      expect(pinnedProjects()).toEqual(new Set(['studio']))
    })
  })

  it('tells its caller when the socket drops', () => {
    const onDisconnect = vi.fn()
    const stop = connectLive(createLiveStore(), { onDisconnect })
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))
    expect(onDisconnect).not.toHaveBeenCalled()

    socket?.dispatchEvent(new Event('close'))

    expect(onDisconnect).toHaveBeenCalledTimes(1)
    stop()
  })

  it('hands each change to the unseen store', () => {
    const unseen = createUnseenStore(null)
    const stop = connectLive(createLiveStore(), { unseen })
    const socket = FakeSocket.instances[0]
    socket?.dispatchEvent(new Event('open'))

    socket?.receive({
      type: 'changes',
      changes: [
        {
          id: 'c1',
          frame: 'studio/home/hero',
          at: '2026-10-19T12:00:00.000Z',
          hash: 'h1',
          author: null,
          elements: [],
          removed: 0,
          whole: true,
          created: true,
        },
      ],
    })

    expect(Object.keys(unseen.getState().unseen)).toEqual(['studio/home/hero'])
    stop()
  })
})

describe('connectLive patches', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const home = (...names: string[]) =>
    boardOf(pageOf(names.map((name) => frameOf(name))))
  const RESYNC = JSON.stringify({ type: 'resync' })
  /** Names a page the board in hand does not hold. */
  const UNKNOWN = {
    type: 'patch',
    data: { root: '/board', projects: ['gone'] },
  }

  function connected() {
    const store = createLiveStore()
    const unseen = createUnseenStore(null)
    const stop = connectLive(store, { unseen })
    const socket = FakeSocket.instances.at(-1)
    if (!socket) throw new Error('no socket')
    socket.dispatchEvent(new Event('open'))
    socket.receive({ type: 'board', data: home('hero') })
    return { store, unseen, socket, stop }
  }

  const asked = (socket: FakeSocket) =>
    socket.sent.filter((text) => text === RESYNC).length

  it('asks for patches in its hello', () => {
    const { socket, stop } = connected()

    expect(JSON.parse(socket.sent[0] ?? '')).toMatchObject({
      type: 'hello',
      role: 'board',
      patches: true,
    })
    stop()
  })

  it('applies a patch to the board it holds', () => {
    const { store, socket, stop } = connected()

    socket.receive({
      type: 'patch',
      data: patchBetween(home('hero'), home('hero', 'about')),
    })

    expect(store.getState().board).toEqual(home('hero', 'about'))
    expect(asked(socket)).toBe(0)
    stop()
  })

  it('takes a patch that changes nothing as a new board', () => {
    const { store, socket, stop } = connected()
    const before = store.getState().board

    socket.receive({
      type: 'patch',
      data: patchBetween(home('hero'), home('hero')),
    })

    const { board } = store.getState()
    expect(board).not.toBe(before)
    expect(board?.projects).toBe(before?.projects)
    stop()
  })

  it('drops the unseen mark of a frame a patch removes', () => {
    const { unseen, socket, stop } = connected()
    socket.receive({
      type: 'changes',
      changes: [
        {
          id: 'c1',
          frame: 'studio/home/hero',
          at: '2026-10-19T12:00:00.000Z',
          hash: 'h1',
          author: null,
          elements: [],
          removed: 0,
          whole: true,
          created: true,
        },
      ],
    })

    socket.receive({ type: 'patch', data: patchBetween(home('hero'), home()) })

    expect(unseen.getState().unseen).toEqual({})
    stop()
  })

  it('asks for the whole board when a patch does not apply, and keeps the one it holds', () => {
    const { store, socket, stop } = connected()

    socket.receive(UNKNOWN)

    expect(asked(socket)).toBe(1)
    expect(store.getState().board).toEqual(home('hero'))
    stop()
  })

  it('takes no patch and asks no more until the whole board comes, then patches again', () => {
    const { store, socket, stop } = connected()
    socket.receive(UNKNOWN)

    socket.receive(UNKNOWN)
    socket.receive({
      type: 'patch',
      data: patchBetween(home('hero'), home('hero', 'late')),
    })
    expect(asked(socket)).toBe(1)
    expect(store.getState().board).toEqual(home('hero'))

    socket.receive({ type: 'board', data: home('hero', 'about') })
    socket.receive({
      type: 'patch',
      data: patchBetween(home('hero', 'about'), home('about')),
    })
    expect(store.getState().board).toEqual(home('about'))
    stop()
  })

  it('applies no patch to the board an earlier socket left', () => {
    vi.useFakeTimers()
    const { store, socket, stop } = connected()
    socket.dispatchEvent(new Event('close'))
    vi.runOnlyPendingTimers()
    const again = FakeSocket.instances.at(-1)
    again?.dispatchEvent(new Event('open'))

    again?.receive({
      type: 'patch',
      data: patchBetween(home('hero'), home('hero', 'about')),
    })

    expect(again).not.toBe(socket)
    expect(store.getState().board).toEqual(home('hero'))
    stop()
  })
})

describe('connectLive frames', () => {
  /** Each ask the reach check made, with the answer the test gives it. */
  let asks: { url: string; answer: (ok: boolean) => void }[]

  beforeEach(() => {
    asks = []
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal(
      'fetch',
      (url: string, { signal }: { signal: AbortSignal }) =>
        new Promise<Response>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
          asks.push({
            url,
            answer: (ok) =>
              resolve(new Response(null, { status: ok ? 200 : 404 })),
          })
        }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function helloFrom(store: LiveStore, port: number) {
    const stop = connectLive(store)
    const socket = FakeSocket.instances.at(-1)
    socket?.dispatchEvent(new Event('open'))
    socket?.receive({ type: 'frames', port })
    return { socket, stop }
  }

  const held = (store: LiveStore) => {
    const { framePort, frameHost } = store.getState()
    return { framePort, frameHost }
  }

  it('loads frames from the other loopback name once it answers', async () => {
    const store = createLiveStore()
    const { stop } = helloFrom(store, 47123)

    expect(held(store)).toEqual({ framePort: null, frameHost: null })
    expect(new URL(asks[0]?.url ?? '').origin).toBe('http://127.0.0.1:47123')
    asks[0]?.answer(true)

    await vi.waitFor(() =>
      expect(held(store)).toEqual({ framePort: 47123, frameHost: '127.0.0.1' }),
    )
    stop()
  })

  it("keeps the tab's hostname when something else answers the other name", async () => {
    const store = createLiveStore()
    const { stop } = helloFrom(store, 47123)

    asks[0]?.answer(false)

    await vi.waitFor(() =>
      expect(held(store)).toEqual({ framePort: 47123, frameHost: 'localhost' }),
    )
    stop()
  })

  it("keeps the tab's hostname when the other name refuses the connection", async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    )
    const store = createLiveStore()
    const { stop } = helloFrom(store, 47123)

    await vi.waitFor(() =>
      expect(held(store)).toEqual({ framePort: 47123, frameHost: 'localhost' }),
    )
    stop()
  })

  it("keeps the tab's hostname when the other name never answers", async () => {
    const store = createLiveStore()
    const { stop } = helloFrom(store, 47123)

    await vi.waitFor(
      () =>
        expect(held(store)).toEqual({
          framePort: 47123,
          frameHost: 'localhost',
        }),
      { timeout: 5000 },
    )
    stop()
  })

  it('asks again for the port a restarted server hands over, holding the old one meanwhile', async () => {
    const store = createLiveStore()
    const { socket, stop } = helloFrom(store, 47123)
    asks[0]?.answer(true)
    await vi.waitFor(() => expect(store.getState().framePort).toBe(47123))

    socket?.receive({ type: 'frames', port: 47124 })

    expect(held(store)).toEqual({ framePort: 47123, frameHost: '127.0.0.1' })
    asks[1]?.answer(false)
    await vi.waitFor(() =>
      expect(held(store)).toEqual({ framePort: 47124, frameHost: 'localhost' }),
    )
    stop()
  })

  it('asks nothing for a port it already settled, as a dropped socket hands over', async () => {
    const store = createLiveStore()
    const { socket, stop } = helloFrom(store, 47123)
    asks[0]?.answer(true)
    await vi.waitFor(() => expect(store.getState().framePort).toBe(47123))

    socket?.receive({ type: 'frames', port: 47123 })

    expect(asks).toHaveLength(1)
    stop()
  })

  it('drops the answer for a port a later hello replaced', async () => {
    const store = createLiveStore()
    const { socket, stop } = helloFrom(store, 47123)
    socket?.receive({ type: 'frames', port: 47124 })
    asks[1]?.answer(true)
    await vi.waitFor(() => expect(store.getState().framePort).toBe(47124))

    asks[0]?.answer(true)
    await new Promise((done) => setTimeout(done))

    expect(store.getState().framePort).toBe(47124)
    stop()
  })
})

describe('receiveLiveReload', () => {
  const HERO = 'studio/home/hero'

  afterEach(() => {
    forgetLiveHashes(null)
  })

  it('keeps the page of a frame whose reload renders bytes a live write left it at', () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')

    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })

    expect(store.getState().reloads).toEqual({ [HERO]: 1 })
    expect(store.getState().kept).toEqual({ [HERO]: 1 })
  })

  it('reloads a frame whose reload carries no hash, as one a token change also reached', () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')

    receiveLiveReload(store, [HERO])

    expect(store.getState().reloads).toEqual({ [HERO]: 1 })
    expect(store.getState().kept).toEqual({})
  })

  it('reloads into bytes another writer left, and then no longer skips to the live ones', () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')

    receiveLiveReload(store, [HERO], { [HERO]: 'agent' })
    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })

    expect(store.getState().reloads).toEqual({ [HERO]: 2 })
    expect(store.getState().kept).toEqual({})
  })

  it('holds a reload while a live write is in flight and keeps the page once it answers', async () => {
    const store = createLiveStore()
    const done = awaitHash(HERO, true)

    receiveLiveReload(store, [HERO], { [HERO]: 'h2' })
    expect(store.getState().reloads).toEqual({})

    rememberLiveHash(HERO, 'h2')
    done()
    await whenSettled(HERO)

    expect(store.getState().kept).toEqual({ [HERO]: 1 })
  })

  it('reloads a held reload once the write in flight was not live', async () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')
    const done = awaitHash(HERO)

    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })
    done()
    await whenSettled(HERO)

    expect(store.getState().reloads).toEqual({ [HERO]: 1 })
    expect(store.getState().kept).toEqual({})
  })

  it('reloads the bytes a live write left once an undo was sent since', () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')
    awaitHash(null)()

    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })

    expect(store.getState().kept).toEqual({})
  })

  it('keeps a late reload of the first of two drops, then reloads those bytes after the second', () => {
    const store = createLiveStore()
    rememberLiveHash(HERO, 'h1')
    rememberLiveHash(HERO, 'h2')

    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })
    receiveLiveReload(store, [HERO], { [HERO]: 'h2' })
    receiveLiveReload(store, [HERO], { [HERO]: 'h1' })

    expect(store.getState().reloads).toEqual({ [HERO]: 3 })
    expect(store.getState().kept).toEqual({ [HERO]: 2 })
  })
})
