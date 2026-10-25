import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createLiveStore,
  type LiveStore,
  receiveAccess,
  receiveDisconnect,
} from '@/client/live/store'

import { watchExpiredLink } from './expired-link'

describe('watchExpiredLink', () => {
  let store: LiveStore
  let notify: () => void
  const start = `${location.pathname}${location.search}`

  beforeEach(() => {
    store = createLiveStore()
    notify = vi.fn()
  })

  afterEach(() => {
    history.replaceState(null, '', start)
  })

  function at(url: string): void {
    history.replaceState(null, '', url)
  }

  it('raises the toast once the first answer says the tab reads, and strips the flag', () => {
    at('/p/studio/home?link=expired#frame')
    watchExpiredLink(store, notify)
    expect(notify).not.toHaveBeenCalled()

    receiveAccess(store, false)

    expect(notify).toHaveBeenCalledOnce()
    expect(`${location.pathname}${location.search}${location.hash}`).toBe(
      '/p/studio/home#frame',
    )
  })

  it('stays silent in a tab that already writes, and still strips the flag', () => {
    at('/?link=expired')
    watchExpiredLink(store, notify)

    receiveAccess(store, true)

    expect(notify).not.toHaveBeenCalled()
    expect(location.search).toBe('')
  })

  it('raises nothing on a second answer after the first settled it', () => {
    at('/?link=expired')
    watchExpiredLink(store, notify)
    receiveAccess(store, false)

    receiveDisconnect(store)
    receiveAccess(store, false)

    expect(notify).toHaveBeenCalledOnce()
  })

  it('does nothing on an address without the flag', () => {
    at('/?other=1')
    watchExpiredLink(store, notify)

    receiveAccess(store, false)

    expect(notify).not.toHaveBeenCalled()
    expect(location.search).toBe('?other=1')
  })

  it('leaves the flag for the next watch when stopped before the answer', () => {
    at('/?link=expired')
    const stop = watchExpiredLink(store, notify)

    stop()
    watchExpiredLink(store, notify)
    receiveAccess(store, false)

    expect(notify).toHaveBeenCalledOnce()
  })
})
