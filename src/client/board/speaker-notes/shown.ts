import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

/** Where the choice persists, in the `frameboard.characterKeys` form. */
export const NOTES_SHOWN_KEY = 'frameboard.speakerNotes'

/** Null when the browser refuses storage, which keeps the choice for this visit. */
export type NotesShownStorage = Pick<Storage, 'getItem' | 'setItem'> | null

export interface NotesShownState {
  /** Whether every slide of the page draws its strip, hidden on a first visit. */
  shown: boolean
}

export type NotesShownStore = StoreApi<NotesShownState>

/**
 * The Notes button's choice, one for every page in this browser, read from
 * `storage` and saving each change back to it.
 */
export function createNotesShownStore(
  storage: NotesShownStorage,
): NotesShownStore {
  const store = createStore<NotesShownState>()(() => ({
    shown: readShown(storage),
  }))
  store.subscribe((state, previous) => {
    if (state.shown !== previous.shown) writeShown(storage, state.shown)
  })
  return store
}

export function setNotesShown(
  shown: boolean,
  store: NotesShownStore = notesShownStore,
): void {
  store.setState({ shown })
}

export function useNotesShown(
  store: NotesShownStore = notesShownStore,
): boolean {
  return useStore(store, (state) => state.shown)
}

function readShown(storage: NotesShownStorage): boolean {
  try {
    return storage?.getItem(NOTES_SHOWN_KEY) === 'shown'
  } catch {
    return false
  }
}

function writeShown(storage: NotesShownStorage, shown: boolean): void {
  try {
    storage?.setItem(NOTES_SHOWN_KEY, shown ? 'shown' : 'hidden')
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}

function windowStorage(): NotesShownStorage {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The one choice the strip, the button, and each label read. */
export const notesShownStore = createNotesShownStore(windowStorage())
