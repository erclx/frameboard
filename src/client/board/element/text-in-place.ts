import { createStore } from 'zustand/vanilla'

import {
  type FramePoint,
  isElementBox,
  isTextEditEnd,
} from '@/shared/frame-bridge/messages'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request, subscribe } from '../bridge/channel'
import { selectedElementBox } from '../geometry/hit'
import type { ElementChange } from '../inspector/element/write'
import type { BoardPoint } from '../notes/pick'
import type { ElementKey, SelectionStore } from '../selection'

/**
 * Sends the changes one edit makes to its element as one write and one undo
 * step, answering whether they were written.
 */
export type WriteText = (changes: readonly ElementChange[]) => Promise<boolean>

/** An in-place text edit the board can end or move the caret of, open or still waiting on its frame. */
export interface TextEditing {
  /** Ends the edit with nothing written, the old text shown again. */
  cancel: () => void
  /** Whether the frame holds the edit open now, read at once so a press can be kept from the board. */
  isOpen: () => boolean
  /** Moves the caret to a frame point, answering whether the point fell in the text being edited. */
  caretAt: (at: FramePoint) => Promise<boolean>
}

/** Where an in-place text edit opens, and whether an element with no text may. */
export interface TextEditOptions {
  /** A frame point picking the run of text beside child elements. */
  at?: FramePoint
  /** Opens an element holding no text, as only a placed Text is, holding a caret. */
  empty?: boolean
  /** Takes an end leaving no text, in place of a write, which a placed Text is removed on. */
  blank?: () => void
}

/** An in-place text edit the board asked a frame to open. */
export interface TextEdit extends TextEditing {
  /** Whether the frame opened it, false for an element holding anything but text. */
  opened: Promise<boolean>
}

/** A frame's live iframe on the board, or null for a placeholder. */
function shownFrame(
  container: ParentNode,
  ref: string,
): HTMLIFrameElement | null {
  return container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] iframe`,
  )
}

/**
 * Opens an element's text for typing in the frame showing the key's bytes,
 * and writes what the frame commits. A frame-local `at` opens the run of
 * text under it beside child elements, and a reload ends it with nothing sent.
 */
export function editTextInPlace(
  container: ParentNode,
  key: ElementKey,
  write: WriteText,
  { at, empty = false, blank }: TextEditOptions = {},
): TextEdit {
  const iframe = shownFrame(container, key.frame)
  if (!iframe) {
    return {
      opened: Promise.resolve(false),
      cancel: () => {},
      isOpen: () => false,
      caretAt: () => Promise.resolve(false),
    }
  }
  const focused = document.activeElement
  let open = false
  // A frame on another origin cannot take focus itself, so the board hands it over.
  iframe.focus()
  const edit = subscribe(
    iframe,
    'text-edit',
    {
      index: key.index,
      hash: key.hash,
      ...(at ? { at } : {}),
      ...(empty ? { empty } : {}),
    },
    (end) => {
      if (!isTextEditEnd(end)) return
      open = false
      edit.close()
      if (end.kind === 'closed') {
        blank?.()
        return
      }
      if (blank && end.text.trim() === '') {
        blank()
        void request(iframe, 'text-written', { edit: edit.id, written: false })
        return
      }
      const changes: ElementChange[] = [
        end.run === undefined
          ? { kind: 'text', value: end.text }
          : { kind: 'text', value: end.text, run: end.run },
      ]
      if (end.breaks) {
        changes.push({
          kind: 'style',
          property: 'white-space',
          value: 'pre-line',
        })
      }
      void write(changes).then((written) =>
        request(iframe, 'text-written', { edit: edit.id, written }),
      )
    },
  )
  const opened = edit.opened.then((value) => {
    if (value === true) {
      open = true
      return true
    }
    // Focus goes back where it was, so the board's keys still reach the board.
    if (document.activeElement === iframe) {
      iframe.blur()
      if (focused instanceof HTMLElement) focused.focus()
    }
    return false
  })
  return {
    opened,
    cancel: () => {
      open = false
      edit.close()
    },
    isOpen: () => open,
    caretAt: async (at) =>
      open &&
      (await request(iframe, 'text-caret', { edit: edit.id, at })) === true,
  }
}

/**
 * Whether a board point falls inside the live box of the element `key`
 * names, in the frame the key names showing the key's bytes, so a
 * double-click there edits it.
 */
export async function overElement(
  container: ParentNode,
  frames: readonly FrameRecord[],
  key: ElementKey,
  at: BoardPoint,
): Promise<boolean> {
  const point = framePoint(frames, key.frame, at)
  const iframe = shownFrame(container, key.frame)
  if (!point || !iframe) return false
  const box = await request(iframe, 'element-box', {
    index: key.index,
    hash: key.hash,
  })
  if (!isElementBox(box)) return false
  const { x, y } = point
  return x >= box.left && x < box.right && y >= box.top && y < box.bottom
}

/**
 * The point in the edited element's frame a board point falls on, when it
 * falls inside the outline the selection draws for `key`, else null. Read
 * from the drawn outline, so a press decides at once, a frame behind typing.
 */
export function pressInEdit(
  layer: ParentNode,
  frames: readonly FrameRecord[],
  key: ElementKey,
  at: BoardPoint,
): FramePoint | null {
  const box = selectedElementBox(layer)
  if (
    !box ||
    at.x < box.x ||
    at.x > box.x + box.width ||
    at.y < box.y ||
    at.y > box.y + box.height
  ) {
    return null
  }
  return framePoint(frames, key.frame, at)
}

/** A board point in the viewport of the frame `ref` names, or null for a frame not drawn. */
export function framePoint(
  frames: readonly FrameRecord[],
  ref: string,
  at: BoardPoint,
): FramePoint | null {
  const frame = frames.find((candidate) => candidate.ref === ref)
  if (!frame) return null
  const page = pageBox(frame.box, frame.device, frame.turn)
  return { x: at.x - page.x, y: at.y - page.y }
}

/**
 * The placed Text open for typing or waiting on its frame, which draws a
 * caret alone, with no outline, marks, or chip, until its edit ends.
 */
export const newTextStore = createStore<{ key: ElementKey | null }>()(() => ({
  key: null,
}))

/**
 * Opens a placed Text, empty, once its frame shows the key's bytes. It ends
 * written, or blank and handed to `remove` once, by an end with no text, a
 * cancel, a selection moving on before it opens, or the board page leaving,
 * which `leaving` marks since no wait can outlast that page.
 */
export function editTextWhenShown(
  container: HTMLElement,
  key: ElementKey,
  write: WriteText,
  selection: SelectionStore,
  remove: (leaving: boolean) => void,
): TextEditing {
  let current: TextEdit | null = null
  let waiting = true
  let ended = false
  newTextStore.setState({ key })
  const board = container.ownerDocument.defaultView
  const end = (empty: boolean, leaving = false) => {
    if (ended) return
    ended = true
    board?.removeEventListener('pagehide', leave)
    if (newTextStore.getState().key === key)
      newTextStore.setState({ key: null })
    if (empty) remove(leaving)
  }
  function leave() {
    stop()
    current?.cancel()
    end(true, true)
  }
  const written: WriteText = (changes) => {
    end(false)
    return write(changes)
  }
  const stop = () => {
    waiting = false
    container.removeEventListener('load', attempt, true)
    unsubscribe()
  }
  function attempt() {
    current?.cancel()
    const edit = editTextInPlace(container, key, written, {
      empty: true,
      blank: () => end(true),
    })
    current = edit
    void edit.opened.then((opened) => {
      if (!opened) return
      // An edit opening after a later load, or after the wait ended, is stale.
      if (edit !== current || !waiting) edit.cancel()
      else stop()
    })
  }
  const unsubscribe = selection.subscribe(({ element }) => {
    if (element?.frame === key.frame && element.index === key.index) return
    stop()
    end(true)
  })
  // A load does not bubble, so a frame reloading is caught on the way down.
  container.addEventListener('load', attempt, true)
  board?.addEventListener('pagehide', leave)
  attempt()
  return {
    cancel: () => {
      stop()
      current?.cancel()
      end(true)
    },
    isOpen: () => current?.isOpen() ?? false,
    caretAt: (at) => current?.caretAt(at) ?? Promise.resolve(false),
  }
}
