import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { connectLive } from './socket'
import { createLiveStore } from './store'

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
})
