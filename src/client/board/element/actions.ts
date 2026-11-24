import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  SendToBack,
  Trash2,
} from 'lucide-react'
import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { align, distribute } from '@/shared/arrange'
import type { ElementTree } from '@/shared/records/elements'

import { ALIGNMENTS, DISTRIBUTIONS, NUDGE_REST_MS } from '../geometry/actions'
import type { Box } from '../geometry/box'
import { type ModeStore, modeStore } from '../mode'
import { notesUi } from '../notes/tool'
import { guessFlow } from '../place/flow-guess'
import {
  deleteElements,
  moveElementTo,
  type WrapRequest,
  wrapSelection,
} from '../place/write'
import {
  type ElementKey,
  select,
  selectedElements,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../selection'
import { arrangeMembers, type GroupMember, moveMembers } from './group'
import { type GroupEdit, shownGroup, startGroupEdit } from './resize'
import { requestTree, treeOf, trees } from './tree'
import { down, sibling, siblingPlace, up } from './walk'

/** What a restack row is found by beside its label. */
const STACK_WORDS = ['layer', 'stack', 'order'] as const

/** The wrap's action, which the Layout section's header button runs. */
export const WRAP_ACTION = 'element.wrap'

/** The document's own wrappers, which a wrap never moves. */
const ROOTS = new Set(['html', 'head', 'body'])

const NUDGES = [
  { name: 'Left', key: 'ArrowLeft', dx: -1, dy: 0 },
  { name: 'Right', key: 'ArrowRight', dx: 1, dy: 0 },
  { name: 'Up', key: 'ArrowUp', dx: 0, dy: -1 },
  { name: 'Down', key: 'ArrowDown', dx: 0, dy: 1 },
] as const

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
  /** Deletes the selected elements, which `deleteElements` does on the board. */
  remove: (page: string, keys: readonly ElementKey[]) => void
  /** Moves an element to the place `to` maps its own to among its siblings, which `moveElementTo` does on the board. */
  move: (
    page: string,
    key: ElementKey,
    to: (place: number, count: number) => number,
  ) => void
  /** The selected elements as their live frame shows them, which `shownGroup` reads on the board. */
  group: (keys: readonly ElementKey[]) => readonly GroupMember[] | null
  /** Starts a previewed edit of the selected elements, null when their frame is held, which `startGroupEdit` does on the board. */
  editGroup: (page: string, keys: readonly ElementKey[]) => GroupEdit | null
  /** Wraps the selected elements in one flow container, which `wrapSelection` does on the board. */
  wrap: (
    page: string,
    keys: readonly ElementKey[],
    request: WrapRequest,
  ) => void
}

/**
 * Whether focus sits on the page or the canvas. A note pin, its card, a media
 * bar, and a label's buttons sit in the canvas but are controls, so focus on
 * them keeps Enter and Tab for them.
 */
export function focusOnBoard(): boolean {
  const focused = document.activeElement
  return (
    !focused ||
    focused === document.body ||
    (focused.closest('[data-canvas]') !== null &&
      focused.closest(
        '[data-note-marker], [data-note-card], [data-media-bar], [data-label-control]',
      ) === null)
  )
}

/**
 * The keys walking a frame's elements, each enabled only with somewhere to move
 * so Esc at a frame falls through to clearing. Registered ahead of the
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
  // Holds the press even at an end, so it never falls through to a frame's key.
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
  // Keyless, so it reads the tree with no focus test.
  const restack = (to: (place: number, count: number) => number) => {
    const moves = () => {
      const state = current()
      if (!state || state.at === null) return false
      const held = siblingPlace(state.tree.elements, state.at)
      if (!held) return false
      const place = to(held.place, held.count)
      return place !== held.place && place >= 0 && place < held.count
    }
    return {
      enabled: () => elementSelected() && context.writable() && moves(),
      run: () => {
        const { page, element } = selection.getState()
        if (page && element) context.move(page, element, to)
      },
    }
  }
  // With no free member, the press falls through to the frame's nudge.
  const nudged = () => {
    const state = selection.getState()
    if (!elementSelected() || !context.writable() || !context.boardFocused()) {
      return null
    }
    const keys = selectedElements(state)
    const members = context.group(keys)
    return state.page && members?.some(({ placed }) => placed !== null)
      ? { page: state.page, keys, members }
      : null
  }
  // A nudge run keeps its elements, so its write names its start if the selection moves.
  let run: {
    keys: readonly ElementKey[]
    members: readonly GroupMember[]
    edit: GroupEdit
    dx: number
    dy: number
  } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    const done = run
    run = null
    if (!done) return
    const edits = moveMembers(done.members, done.dx, done.dy)
    if (edits.length > 0 && (done.dx !== 0 || done.dy !== 0)) {
      void done.edit.commit(edits)
    } else {
      done.edit.cancel()
    }
  }
  const nudge = (dx: number, dy: number) => ({
    enabled: () => nudged() !== null,
    run: () => {
      const keys = selectedElements(selection.getState())
      if (run && !sameKeys(run.keys, keys)) flush()
      if (!run) {
        const found = nudged()
        const edit = found ? context.editGroup(found.page, found.keys) : null
        if (!found || !edit) return
        run = { keys: found.keys, members: found.members, edit, dx: 0, dy: 0 }
      }
      run.dx += dx
      run.dy += dy
      run.edit.preview(moveMembers(run.members, run.dx, run.dy))
      clearTimeout(timer)
      timer = setTimeout(flush, NUDGE_REST_MS)
    },
  })
  // A flow member disables it, since its place is its container's alignment.
  const arrange = (
    least: number,
    arranged: (boxes: Record<string, Box>) => Record<string, Box>,
  ) => {
    const ready = () => {
      const state = selection.getState()
      if (!elementSelected() || !context.writable() || !state.page) return null
      const keys = selectedElements(state)
      const members = keys.length >= least ? context.group(keys) : null
      return members?.every(({ placed, locked }) => placed !== null && !locked)
        ? { page: state.page, keys, members }
        : null
    }
    return {
      enabled: () => ready() !== null,
      run: () => {
        const found = ready()
        if (!found) return
        const edits = arrangeMembers(found.members, arranged)
        if (edits.length === 0) return
        void context.editGroup(found.page, found.keys)?.commit(edits)
      },
    }
  }
  // Siblings alone, since moving an element between parents changes what it inherits.
  const wrappable = () => {
    const state = selection.getState()
    if (!elementSelected() || !context.writable() || !state.page) return null
    const keys = selectedElements(state)
    const [first] = keys
    const tree = first ? context.treeOf(first.frame) : null
    if (!first || !tree || tree.hash !== first.hash) return null
    const rows = keys.map(({ index }) =>
      tree.elements.find((row) => row.index === index),
    )
    const parent = rows[0]?.parent
    if (
      rows.some((row) => !row || row.parent !== parent || ROOTS.has(row.tag))
    ) {
      return null
    }
    const members = context.group(keys)
    return members ? { page: state.page, keys, members } : null
  }
  // No palette rows, since these keys need board focus the open palette holds.
  return [
    // Ahead of the frame's nudges, which hold the same keys.
    ...NUDGES.flatMap(({ name, key, dx, dy }): Action[] => [
      {
        id: `element.nudge${name}`,
        label: `Nudge ${name.toLowerCase()}`,
        group: 'selection',
        palette: false,
        keys: [key],
        repeat: true,
        ...nudge(dx, dy),
      },
      {
        id: `element.nudge${name}Far`,
        label: `Nudge ${name.toLowerCase()} 10 px`,
        group: 'selection',
        palette: false,
        keys: [`Shift+${key}`],
        repeat: true,
        ...nudge(dx * 10, dy * 10),
      },
    ]),
    // Ahead of the frames' aligns, which share their keys and palette names.
    ...ALIGNMENTS.map(({ id, label, alignment, key }): Action => ({
      id: elementArrangeId(id),
      label,
      group: 'arrange',
      palette: false,
      keys: [key],
      ...arrange(2, (boxes) => align(boxes, alignment)),
    })),
    ...DISTRIBUTIONS.map(({ id, label, axis, key }): Action => ({
      id: elementArrangeId(id),
      label,
      group: 'arrange',
      palette: false,
      keys: [key],
      ...arrange(3, (boxes) => distribute(boxes, axis)),
    })),
    {
      id: WRAP_ACTION,
      label: 'Use auto layout',
      group: 'selection',
      command: {
        label: 'Use auto layout',
        keywords: ['wrap', 'flex', 'container', 'group'],
      },
      keys: ['Shift+KeyA'],
      enabled: () => wrappable() !== null,
      run: () => {
        const found = wrappable()
        if (!found) return
        const placed = found.members.flatMap(({ placed }) =>
          placed ? [placed] : [],
        )
        context.wrap(found.page, found.keys, {
          flow: guessFlow(
            found.members.map(({ box }) => box),
            found.members.map(({ margin }) => margin),
          ),
          // A member in the flow keeps the container there too.
          spot:
            placed.length === found.members.length
              ? {
                  left: Math.min(...placed.map(({ left }) => left)),
                  top: Math.min(...placed.map(({ top }) => top)),
                }
              : null,
        })
      },
    },
    {
      id: 'element.down',
      label: 'Select child',
      group: 'selection',
      palette: false,
      keys: ['Enter'],
      ...onBoard(go(down)),
    },
    {
      id: 'element.up',
      label: 'Select parent',
      group: 'selection',
      palette: false,
      keys: ['Escape'],
      // Holds Esc for an open note card or an armed tool before clearing the selection.
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
      command: { label: 'Delete element', icon: Trash2, keywords: ['remove'] },
      // The frame delete holds the same keys and stands aside while an element is selected.
      keys: ['Backspace', 'Delete'],
      enabled: () => elementSelected() && context.writable(),
      run: () => {
        const state = selection.getState()
        const keys = selectedElements(state)
        if (state.page && keys.length > 0) context.remove(state.page, keys)
      },
    },
    {
      id: 'element.moveUp',
      label: 'Move up among siblings',
      group: 'selection',
      palette: false,
      // Alt+ArrowUp alone goes to all projects.
      keys: ['Alt+Shift+ArrowUp'],
      ...shift(-1),
    },
    {
      id: 'element.moveDown',
      label: 'Move down among siblings',
      group: 'selection',
      palette: false,
      keys: ['Alt+Shift+ArrowDown'],
      ...shift(1),
    },
    {
      id: 'element.toFront',
      label: 'Bring to front',
      group: 'selection',
      command: {
        label: 'Bring to front',
        icon: BringToFront,
        keywords: STACK_WORDS,
      },
      ...restack((_place, count) => count - 1),
    },
    // The menu's rows, since the move keys need board focus.
    {
      id: 'element.forward',
      label: 'Bring forward',
      group: 'selection',
      command: { label: 'Bring forward', icon: ArrowUp, keywords: STACK_WORDS },
      ...restack((place) => place + 1),
    },
    {
      id: 'element.backward',
      label: 'Send backward',
      group: 'selection',
      command: {
        label: 'Send backward',
        icon: ArrowDown,
        keywords: STACK_WORDS,
      },
      ...restack((place) => place - 1),
    },
    {
      id: 'element.toBack',
      label: 'Send to back',
      group: 'selection',
      command: {
        label: 'Send to back',
        icon: SendToBack,
        keywords: STACK_WORDS,
      },
      ...restack(() => 0),
    },
    {
      id: 'element.next',
      label: 'Select next sibling',
      group: 'selection',
      palette: false,
      keys: ['Tab'],
      ...onBoard(go(fromElement((tree, at) => sibling(tree, at, 1)))),
    },
    {
      id: 'element.previous',
      label: 'Select previous sibling',
      group: 'selection',
      palette: false,
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
        remove: (at, keys) => void deleteElements(at, keys),
        move: (at, key, to) => void moveElementTo(at, key, to),
        group: (keys) => shownGroup(document, keys),
        editGroup: startGroupEdit,
        wrap: (at, keys, request) => void wrapSelection(at, keys, request),
      }),
    )
    // Fetched on selection and on each reload, since the keys walk this tree.
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

/** The id an element's align or distribute takes beside the frames' `arrange.<name>`. */
export function elementArrangeId(frameId: string): string {
  return `element.${frameId.replace(/^arrange\./, '')}`
}

function sameKeys(a: readonly ElementKey[], b: readonly ElementKey[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (key, at) =>
        key.frame === b[at]?.frame &&
        key.index === b[at]?.index &&
        key.hash === b[at]?.hash,
    )
  )
}
