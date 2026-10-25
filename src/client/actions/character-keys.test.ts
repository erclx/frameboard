import { describe, expect, it } from 'vitest'

import {
  CHARACTER_KEYS_KEY,
  createCharacterKeysStore,
  liveKey,
  setCharacterKeys,
} from './character-keys'

function memoryStorage(saved?: string): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  if (saved !== undefined) values.set(CHARACTER_KEYS_KEY, saved)
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

const throwingStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('Storage refused')
  },
  setItem: () => {
    throw new Error('Storage refused')
  },
}

describe('createCharacterKeysStore', () => {
  it('starts on with nothing saved', () => {
    const store = createCharacterKeysStore(memoryStorage())

    expect(store.getState().on).toBe(true)
  })

  it('starts off once turned off before', () => {
    const store = createCharacterKeysStore(memoryStorage('off'))

    expect(store.getState().on).toBe(false)
  })

  it('saves a change for the next visit', () => {
    const storage = memoryStorage()
    const store = createCharacterKeysStore(storage)

    setCharacterKeys(false, store)

    expect(createCharacterKeysStore(storage).getState().on).toBe(false)
  })

  it('starts on and still switches when storage throws', () => {
    const store = createCharacterKeysStore(throwingStorage)

    setCharacterKeys(false, store)

    expect(store.getState().on).toBe(false)
  })
})

describe('liveKey', () => {
  it('prints the first binding while the switch is on', () => {
    expect(liveKey(['v', '$mod+KeyV'], true)).toBe('v')
  })

  it('skips a character key while the switch is off', () => {
    expect(liveKey(['Shift+Digit0', '$mod+Digit0'], false)).toBe('$mod+Digit0')
  })

  it('prints nothing when every binding is a character key and off', () => {
    expect(liveKey(['BracketRight'], false)).toBeUndefined()
  })
})
