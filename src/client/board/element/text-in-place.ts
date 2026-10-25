import type { FrameRecord } from '@/shared/records/list'

import { elementAt, renderedHash } from '../frame-dom'
import { NEWLINES } from '../inspector/element/text'
import type { WriteElement } from '../inspector/element/write'
import type { BoardPoint } from '../notes/pick'
import type { ElementKey, SelectionStore } from '../selection'

/** Marks the live element an in-place edit has open, for the overlay and the tests. */
export const EDITING = 'data-frameboard-editing'

/**
 * Opens the text of the element `key` names for typing on the canvas, in its
 * live frame, with its text selected, so typing replaces it. Enter or a blur
 * writes the new text through `write` and Esc puts the old text back.
 * Text is one line, as the Text field keeps it, so a newline, typed with
 * Shift or pasted, becomes a space, and a paste is taken as plain text.
 * A reload of the frame ends the edit with nothing sent, since its hash names
 * bytes the file no longer holds. Answers the function that cancels the
 * edit, or null when the frame does not show those bytes or the element
 * holds more than text or none, as the Text field's `textOnly` reads it, so
 * an empty box such as a placed shape never takes text.
 */
export function editTextInPlace(
  document: Document,
  key: ElementKey,
  write: WriteElement,
): (() => void) | null {
  const view = document.defaultView
  const found = elementAt(document, key.index)
  if (
    !view ||
    renderedHash(document) !== key.hash ||
    !(found instanceof view.HTMLElement) ||
    found.childElementCount > 0 ||
    (found.textContent ?? '').trim() === ''
  ) {
    return null
  }
  const element: HTMLElement = found
  const before = element.textContent ?? ''
  let open = true

  const close = () => {
    open = false
    element.removeAttribute('contenteditable')
    element.removeAttribute(EDITING)
    element.removeEventListener('keydown', keydown)
    element.removeEventListener('paste', paste)
    element.removeEventListener('blur', commit)
    view.removeEventListener('pagehide', close)
  }
  const cancel = () => {
    if (!open) return
    close()
    element.textContent = before
  }
  function commit() {
    if (!open) return
    close()
    const value = (element.textContent ?? '').replace(NEWLINES, ' ')
    element.textContent = value
    if (value === before) return
    void write({ kind: 'text', value }).then((written) => {
      // The frame reloads with a landed write, so only a refusal shows the old text.
      if (!written && element.isConnected) element.textContent = before
    })
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!event.shiftKey) commit()
      else insert(' ')
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault()
    insert(
      (event.clipboardData?.getData('text/plain') ?? '').replace(NEWLINES, ' '),
    )
  }
  const insert = (text: string) => {
    const range = view.getSelection()?.getRangeAt(0)
    if (!range || !element.contains(range.commonAncestorContainer)) return
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    element.normalize()
  }

  element.setAttribute('contenteditable', 'plaintext-only')
  element.setAttribute(EDITING, '')
  element.addEventListener('keydown', keydown)
  element.addEventListener('paste', paste)
  element.addEventListener('blur', commit)
  view.addEventListener('pagehide', close)
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = view.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return cancel
}

/** The live document a frame's iframe shows, or null for a placeholder. */
function shownDocument(container: ParentNode, ref: string): Document | null {
  return (
    container.querySelector<HTMLIFrameElement>(
      `[data-frame="${CSS.escape(ref)}"] iframe`,
    )?.contentDocument ?? null
  )
}

/**
 * Whether a board point falls inside the live box of the element `key`
 * names, in the frame the key names, so a double-click there edits it.
 */
export function overElement(
  container: ParentNode,
  frames: readonly FrameRecord[],
  key: ElementKey,
  at: BoardPoint,
): boolean {
  const frame = frames.find((candidate) => candidate.ref === key.frame)
  const shown = frame && shownDocument(container, frame.ref)
  const element = shown && elementAt(shown, key.index)
  if (!frame || !element) return false
  const box = element.getBoundingClientRect()
  const x = at.x - frame.box.x
  const y = at.y - frame.box.y
  return x >= box.left && x < box.right && y >= box.top && y < box.bottom
}

/**
 * Opens the element `key` names for typing once its frame shows the bytes
 * the key was read from, at once when it already does, else on the reload
 * that brings them, as a placed Text waits for the frame to show it. It
 * stops waiting once the selection names another element. Answers the
 * function that stops waiting or cancels the edit.
 */
export function editTextWhenShown(
  container: HTMLElement,
  key: ElementKey,
  write: WriteElement,
  selection: SelectionStore,
): () => void {
  let cancel: (() => void) | null = null
  const stop = () => {
    container.removeEventListener('load', attempt, true)
    unsubscribe()
  }
  function attempt() {
    const shown = shownDocument(container, key.frame)
    cancel = shown ? editTextInPlace(shown, key, write) : null
    if (cancel) stop()
  }
  const unsubscribe = selection.subscribe(({ element }) => {
    if (element?.frame !== key.frame || element.index !== key.index) stop()
  })
  // A load does not bubble, so a frame reloading is caught on the way down.
  container.addEventListener('load', attempt, true)
  attempt()
  return () => {
    stop()
    cancel?.()
  }
}
