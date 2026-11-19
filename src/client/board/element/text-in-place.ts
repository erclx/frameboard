import {
  type FramePoint,
  isElementBox,
  isTextEditEnd,
} from '@/shared/frame-bridge/messages'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { request, subscribe } from '../bridge/channel'
import type { ElementChange } from '../inspector/element/write'
import type { BoardPoint } from '../notes/pick'
import type { ElementKey, SelectionStore } from '../selection'

/**
 * Sends the changes one edit makes to its element as one write and one undo
 * step, answering whether they were written.
 */
export type WriteText = (changes: readonly ElementChange[]) => Promise<boolean>

/** An in-place text edit the board asked a frame to open. */
export interface TextEdit {
  /** Whether the frame opened it, false for an element holding anything but text. */
  opened: Promise<boolean>
  /** Ends the edit with nothing written, the old text shown again. */
  cancel: () => void
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
  at?: FramePoint,
): TextEdit {
  const iframe = shownFrame(container, key.frame)
  if (!iframe) return { opened: Promise.resolve(false), cancel: () => {} }
  const focused = document.activeElement
  // A frame on another origin cannot take focus itself, so the board hands it over.
  iframe.focus()
  const edit = subscribe(
    iframe,
    'text-edit',
    { index: key.index, hash: key.hash, ...(at ? { at } : {}) },
    (end) => {
      if (!isTextEditEnd(end)) return
      edit.close()
      if (end.kind === 'closed') return
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
    if (value === true) return true
    // Focus goes back where it was, so the board's keys still reach the board.
    if (document.activeElement === iframe) {
      iframe.blur()
      if (focused instanceof HTMLElement) focused.focus()
    }
    return false
  })
  return { opened, cancel: edit.close }
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
 * Opens an element for typing once its frame shows the key's bytes, as a
 * placed Text waits, and stops waiting once the selection moves on.
 */
export function editTextWhenShown(
  container: HTMLElement,
  key: ElementKey,
  write: WriteText,
  selection: SelectionStore,
): () => void {
  let current: TextEdit | null = null
  let waiting = true
  const stop = () => {
    waiting = false
    container.removeEventListener('load', attempt, true)
    unsubscribe()
  }
  function attempt() {
    current?.cancel()
    const edit = editTextInPlace(container, key, write)
    current = edit
    void edit.opened.then((opened) => {
      if (!opened) return
      // An edit opening after a later load, or after the wait ended, is stale.
      if (edit !== current || !waiting) edit.cancel()
      else stop()
    })
  }
  const unsubscribe = selection.subscribe(({ element }) => {
    if (element?.frame !== key.frame || element.index !== key.index) stop()
  })
  // A load does not bubble, so a frame reloading is caught on the way down.
  container.addEventListener('load', attempt, true)
  attempt()
  return () => {
    stop()
    current?.cancel()
  }
}
