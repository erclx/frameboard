import { MessageSquare } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'

import { modeStore } from '../mode'
import type { NotePick } from './pick'

/** What the Note tool has open on the canvas, being a new note's composer or a note's thread. */
export type NoteOpen =
  | { kind: 'new'; pick: NotePick }
  | { kind: 'thread'; page: string; id: string }

export interface NotesUiState {
  open: NoteOpen | null
  /**
   * Unsent text, a thread's reply by its root note id and a new note's by
   * `newNoteDraft(frame)`, so a card closed by a stray press reopens with it.
   */
  drafts: Readonly<Record<string, string>>
}

/** The draft key a new note on `frame` keeps its text under, apart from any note id. */
export function newNoteDraft(frame: string): string {
  return `new:${frame}`
}

export const notesUi = createStore<NotesUiState>()(() => ({
  open: null,
  drafts: {},
}))

export function useNotesUi<T>(selector: (state: NotesUiState) => T): T {
  return useStore(notesUi, selector)
}

/** Holds unsent text under `key`, dropping it once it is empty. */
export function setDraft(key: string, text: string): void {
  notesUi.setState(({ drafts }) => {
    const { [key]: _dropped, ...rest } = drafts
    return { drafts: text === '' ? rest : { ...rest, [key]: text } }
  })
}

export function closeNote(): void {
  notesUi.setState({ open: null })
}

const canWrite = () => liveStore.getState().canWrite

/**
 * Registers the Note tool, key N, which fills the toolbar's Note slot. It
 * writes, so it is enabled only while this tab may, and a tab losing write
 * returns to Move and closes an open composer.
 */
export function useNoteTool(): void {
  useEffect(() => {
    const unregister = registerActions([
      {
        id: 'tool.note',
        label: 'Note',
        group: 'tool',
        command: { label: 'Add a note', icon: MessageSquare },
        keys: ['n'],
        enabled: canWrite,
        run: () => modeStore.setState({ tool: 'note', mode: 'edit' }),
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'note',
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite === previous.canWrite) return
      refreshActions()
      if (!state.canWrite && modeStore.getState().tool === 'note') {
        modeStore.setState({ tool: 'move' })
      }
      if (!state.canWrite && notesUi.getState().open?.kind === 'new') {
        closeNote()
      }
    })
    // Leaving the tool or entering Play drops a composer the click opened.
    const unsubscribeMode = modeStore.subscribe((state) => {
      const open = notesUi.getState().open
      if (
        state.mode === 'play' ||
        (open?.kind === 'new' && state.tool !== 'note')
      ) {
        closeNote()
      }
    })
    return () => {
      unsubscribeMode()
      unsubscribe()
      unregister()
    }
  }, [])
}
