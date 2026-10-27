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
import { deleteElement, moveElementTo } from '../place/write'
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
  /** True while focus sits on the canvas or nowhere, so a focused control keeps Tab and Enter. */
  boardFocused: () => boolean
  /** True while this tab may write. */
  writable: () => boolean
  /** Deletes an element, which `deleteElement` does on the board. */
  remove: (page: string, key: ElementKey) => void
  /** Moves an element to the place `to` maps its own to among its siblings, which `moveElementTo` does on the board. */
  move: (page: string, key: ElementKey, to: (place: number) => number) => void
}

/**
 * Whether focus sits on the page itself or inside the canvas. A click on the
 * canvas's hit layer, which takes no focus, leaves it on the body, while a
 * panel row or a toolbar button keeps it until it moves on.
 */
export function focusOnBoard(): boolean {
  const focused = document.activeElement
  return (
    !focused ||
    focused === document.body ||
    focused.closest('[data-canvas]') !== null
  )
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

  /** Enter and Tab also move focus or press a control, so they walk only while focus sits on the board. */
  const onBoard = (walk: ReturnType<typeof go>) => ({
    enabled: () => context.boardFocused() && walk.enabled(),
    run: walk.run,
  })
  const escape = go(fromElement(up))
  const elementSelected = () => {
    const { page, element } = selection.getState()
    return (
      mode.getState().mode === 'edit' &&
      page === context.page() &&
      Boolean(element)
    )
  }
  /**
   * A move key holds the press with any element selected, even at the end of
   * its siblings, where the move sends nothing, so it never falls through to
   * a frame's key. It reads no tree here, since a press queued behind a move
   * still in flight reads the place that move left it at.
   */
  const shift = (step: 1 | -1) => ({
    enabled: () =>
      elementSelected() && context.writable() && context.boardFocused(),
    run: () => {
      const { page, element } = selection.getState()
      if (page && element) {
        context.move(page, element, (place) => place + step)
      }
    },
  })
  return [
    {
      id: 'element.down',
      label: 'Select child',
      group: 'selection',
      keys: ['Enter'],
      ...onBoard(go(down)),
    },
    {
      id: 'element.up',
      label: 'Select parent',
      group: 'selection',
      keys: ['Escape'],
      // With a note card open, the card's own listener closes it and this
      // row holds the press, so the selection clear behind it never runs
      // on the same Esc.
      // An armed tool takes Esc first, returning to Move.
      enabled: () =>
        elementSelected() &&
        (context.noteOpen() ||
          (mode.getState().tool === 'move' && escape.enabled())),
      run: () => {
        if (!context.noteOpen()) escape.run()
      },
    },
    {
      id: 'element.delete',
      label: 'Delete',
      group: 'selection',
      // The frame delete holds the same keys and stands aside while an element is selected.
      keys: ['Backspace', 'Delete'],
      enabled: () => elementSelected() && context.writable(),
      run: () => {
        const { page, element } = selection.getState()
        if (page && element) context.remove(page, element)
      },
    },
    {
      id: 'element.moveUp',
      label: 'Move up among siblings',
      group: 'selection',
      // Alt+ArrowUp alone goes to all projects.
      keys: ['Alt+Shift+ArrowUp'],
      ...shift(-1),
    },
    {
      id: 'element.moveDown',
      label: 'Move down among siblings',
      group: 'selection',
      keys: ['Alt+Shift+ArrowDown'],
      ...shift(1),
    },
    {
      id: 'element.next',
      label: 'Select next sibling',
      group: 'selection',
      keys: ['Tab'],
      ...onBoard(go(fromElement((tree, at) => sibling(tree, at, 1)))),
    },
    {
      id: 'element.previous',
      label: 'Select previous sibling',
      group: 'selection',
      keys: ['Shift+Tab'],
      ...onBoard(go(fromElement((tree, at) => sibling(tree, at, -1)))),
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
        boardFocused: focusOnBoard,
        writable: () => liveStore.getState().canWrite,
        remove: (at, key) => void deleteElement(at, key),
        move: (at, key, to) => void moveElementTo(at, key, to),
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
      liveStore.subscribe((state, previous) => {
        if (state.canWrite !== previous.canWrite) refreshActions()
      }),
      notesUi.subscribe(refreshActions),
      trees.store.subscribe(refreshActions),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [page])
}
