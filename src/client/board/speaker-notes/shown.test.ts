import { describe, expect, it } from 'vitest'

import { createNotesShownStore, NOTES_SHOWN_KEY, setNotesShown } from './shown'

function memoryStorage(saved?: string): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  if (saved !== undefined) values.set(NOTES_SHOWN_KEY, saved)
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

describe('createNotesShownStore', () => {
  it('starts hidden on a first visit', () => {
    const store = createNotesShownStore(memoryStorage())

    expect(store.getState().shown).toBe(false)
  })

  it('starts shown once shown before', () => {
    const store = createNotesShownStore(memoryStorage('shown'))

    expect(store.getState().shown).toBe(true)
  })

  it('keeps a hide for the next visit', () => {
    const storage = memoryStorage('shown')
    const store = createNotesShownStore(storage)

    setNotesShown(false, store)

    expect(createNotesShownStore(storage).getState().shown).toBe(false)
  })

  it('starts hidden and still switches when storage throws', () => {
    const store = createNotesShownStore(throwingStorage)

    setNotesShown(true, store)

    expect(store.getState().shown).toBe(true)
  })
})
