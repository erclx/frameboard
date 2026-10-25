import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { isCharacterKey } from './keys'

/** Where the switch persists, in the `frameboard.home.layout` form. */
export const CHARACTER_KEYS_KEY = 'frameboard.characterKeys'

/** Null when the browser refuses storage, which keeps the choice for this visit. */
export type CharacterKeysStorage = Pick<Storage, 'getItem' | 'setItem'> | null

export interface CharacterKeysState {
  /** Whether a key typing a character runs its action, on unless turned off. */
  on: boolean
}

export type CharacterKeysStore = StoreApi<CharacterKeysState>

/**
 * The Single-key shortcuts switch WCAG 2.1.4 asks for, read from `storage`
 * and saving each change back to it.
 */
export function createCharacterKeysStore(
  storage: CharacterKeysStorage,
): CharacterKeysStore {
  const store = createStore<CharacterKeysState>()(() => ({
    on: readOn(storage),
  }))
  store.subscribe((state, previous) => {
    if (state.on !== previous.on) writeOn(storage, state.on)
  })
  return store
}

export function setCharacterKeys(
  on: boolean,
  store: CharacterKeysStore = characterKeysStore,
): void {
  store.setState({ on })
}

export function characterKeysOn(
  store: CharacterKeysStore = characterKeysStore,
): boolean {
  return store.getState().on
}

export function useCharacterKeysOn(
  store: CharacterKeysStore = characterKeysStore,
): boolean {
  return useStore(store, (state) => state.on)
}

/**
 * The first binding a chip should print, skipping a character key while the
 * switch is off, so an off key shows no chip. Undefined when none is live.
 */
export function liveKey(
  keys: readonly string[] | undefined,
  on: boolean = characterKeysOn(),
): string | undefined {
  return keys?.find((key) => on || !isCharacterKey(key))
}

function readOn(storage: CharacterKeysStorage): boolean {
  try {
    return storage?.getItem(CHARACTER_KEYS_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeOn(storage: CharacterKeysStorage, on: boolean): void {
  try {
    storage?.setItem(CHARACTER_KEYS_KEY, on ? 'on' : 'off')
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}

function windowStorage(): CharacterKeysStorage {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The one switch the registry and every chip read. */
export const characterKeysStore = createCharacterKeysStore(windowStorage())
