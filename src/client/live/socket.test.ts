import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

    socket?.receive({ type: 'access', write: true })
    expect(store.getState().canWrite).toBe(true)

    socket?.dispatchEvent(new Event('close'))
    expect(store.getState().canWrite).toBe(false)
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
