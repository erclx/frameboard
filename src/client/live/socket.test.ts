import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createModeStore } from '@/client/board/mode'
import {
  createSelectionStore,
  followSelection,
  select,
  selectElement,
} from '@/client/board/selection'
import { createThemeStore, flipFrame } from '@/client/theme/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { connectLive } from './socket'
import { createLiveStore } from './store'
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
