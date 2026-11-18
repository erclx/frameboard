import { MessageSquare } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'

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

/**
 * Opens a new note on the whole frame with `text` as its draft, its pin at
 * the frame's top right corner, so a board action can ask the agent something.
 */
export function askOnFrame(
  frame: Pick<FrameRecord, 'ref' | 'name' | 'box'>,
  text: string,
): void {
  setDraft(newNoteDraft(frame.ref), text)
  modeStore.setState({ tool: 'note', mode: 'edit' })
  notesUi.setState({
    open: {
      kind: 'new',
      pick: {
        frame: { ref: frame.ref, name: frame.name },
        element: null,
        renderedAt: null,
        at: { x: frame.box.x + frame.box.width, y: frame.box.y },
      },
    },
  })
}

const canWrite = () => liveStore.getState().canWrite

/**
 * Registers the Note tool, enabled only while the tab writes. Losing write or
 * the canvas returns to Move and closes the composer, so it never carries over.
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
      if (modeStore.getState().tool === 'note') {
        modeStore.setState({ tool: 'move' })
      }
      if (notesUi.getState().open?.kind === 'new') closeNote()
    }
  }, [])
}
