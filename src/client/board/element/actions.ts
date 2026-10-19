import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import type { ElementTree } from '@/shared/records/elements'

import { type ModeStore, modeStore } from '../mode'
import { notesUi } from '../notes/tool'
import {
  type ElementKey,
  select,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../selection'
import { requestTree, treeOf, trees } from './tree'
import { down, sibling, up } from './walk'

export interface ElementContext {
  /** The page the canvas shows. */
  page: () => string
  selection: SelectionStore
  mode: ModeStore
  /** A frame's tree as the server last answered it, null until it has. */
  treeOf: (ref: string) => ElementTree | null
  /** True while a note card is open, which takes Esc first. */
  noteOpen: () => boolean
}

/**
 * The keys that walk the selection through a frame's elements: Enter goes
 * down, Esc up, and Tab and Shift+Tab to the next and previous sibling. Each
 * is enabled only in Edit with the selection it moves from and somewhere to
 * move to, so Esc at a frame falls through to clearing the selection and Tab
 * with no element selected keeps its focus move. Registered ahead of the
 * geometry actions, since the first enabled action holding a key runs.
 */
export function elementActions(context: ElementContext): Action[] {
  const { selection, mode } = context
  /** The one selected frame on this page, its element if any, and its tree when it agrees with that element's bytes. */
  const current = () => {
    const { page, frames, element } = selection.getState()
    const frame = frames[0]
    if (mode.getState().mode !== 'edit' || page !== context.page()) return null
    if (frames.length !== 1 || !frame) return null
    const tree = context.treeOf(frame)
    if (!tree || (element && element.hash !== tree.hash)) return null
    return { page, frame, at: element?.index ?? null, tree }
  }
  const go = (
    target: (
      tree: ElementTree['elements'],
      at: number | null,
    ) => number | null | undefined,
  ) => {
    const from = () => {
      const state = current()
      if (!state) return undefined
      const next = target(state.tree.elements, state.at)
      return next === undefined ? undefined : { ...state, next }
    }
    return {
      enabled: () => from() !== undefined,
      run: () => {
        const moved = from()
        if (!moved) return
        const { page, frame, next, tree } = moved
        if (next === null) select(selection, page, [frame])
        else {
          const key: ElementKey = { frame, index: next, hash: tree.hash }
          selectElement(selection, page, key)
        }
      },
    }
  }
  const fromElement =
    (
      step: (
        tree: ElementTree['elements'],
        at: number,
      ) => number | null | undefined,
    ) =>
    (tree: ElementTree['elements'], at: number | null) =>
      at === null ? undefined : step(tree, at)

  const escape = go(fromElement(up))
  return [
    {
      id: 'element.down',
      label: 'Select child',
      group: 'selection',
      keys: ['Enter'],
      ...go(down),
    },
    {
      id: 'element.up',
      label: 'Select parent',
      group: 'selection',
      keys: ['Escape'],
      // An open note card closes on Esc first, so one press does one thing.
      enabled: () => !context.noteOpen() && escape.enabled(),
      run: escape.run,
    },
    {
      id: 'element.next',
      label: 'Select next sibling',
      group: 'selection',
      keys: ['Tab'],
      ...go(fromElement((tree, at) => sibling(tree, at, 1))),
    },
    {
      id: 'element.previous',
      label: 'Select previous sibling',
      group: 'selection',
      keys: ['Shift+Tab'],
      ...go(fromElement((tree, at) => sibling(tree, at, -1))),
    },
  ]
}

/** Registers the element keys for the page a canvas shows, rereading them as the selection, mode, notes, or trees change. */
export function useElementActions(page: string): void {
  useEffect(() => {
    const unregister = registerActions(
      elementActions({
        page: () => page,
        selection: selectionStore,
        mode: modeStore,
        treeOf,
        noteOpen: () => notesUi.getState().open !== null,
      }),
    )
    // The keys walk the one selected frame's tree, so it is fetched once
    // that frame is selected and again on each reload of it.
    const fetchSelected = () => {
      const { frames } = selectionStore.getState()
      if (frames.length === 1 && frames[0]) requestTree(frames[0])
    }
    fetchSelected()
    const unsubscribe = [
      selectionStore.subscribe(fetchSelected),
      liveStore.subscribe((state, previous) => {
        if (state.reloads !== previous.reloads) fetchSelected()
      }),
      selectionStore.subscribe(refreshActions),
      modeStore.subscribe(refreshActions),
      notesUi.subscribe(refreshActions),
      trees.store.subscribe(refreshActions),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [page])
}
