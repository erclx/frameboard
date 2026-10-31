import { describe, expect, it } from 'vitest'

import { createRecentStore, RECENT_KEY, type RecentStorage } from './recent'

/** A storage holding what it was last given, as `localStorage` does. */
function memoryStorage(initial: Record<string, string> = {}): RecentStorage {
  const held = new Map(Object.entries(initial))
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
  }
}

describe('createRecentStore', () => {
  it('keeps the five actions last run, newest first', () => {
    const store = createRecentStore(memoryStorage())

    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) store.getState().record(id)

    expect(store.getState().ids).toEqual(['f', 'e', 'd', 'c', 'b'])
  })

  it('moves an action run again to the front rather than listing it twice', () => {
    const store = createRecentStore(memoryStorage())

    for (const id of ['a', 'b', 'a']) store.getState().record(id)

    expect(store.getState().ids).toEqual(['a', 'b'])
  })

  it('reads back what an earlier visit kept', () => {
    const storage = memoryStorage()
    createRecentStore(storage).getState().record('view.zoomIn')

    expect(createRecentStore(storage).getState().ids).toEqual(['view.zoomIn'])
  })

  it('opens empty on a stored value it cannot read', () => {
    const store = createRecentStore(memoryStorage({ [RECENT_KEY]: '{oops' }))

    expect(store.getState().ids).toEqual([])
  })

  it('keeps nothing when the browser refuses storage', () => {
    const store = createRecentStore(null)

    store.getState().record('view.zoomIn')

    expect(store.getState().ids).toEqual([])
  })
})
