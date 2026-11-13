import type { FrameRecord } from '@/shared/records/list'

import { elementAt, renderedHash } from '../frame-dom'
import type { ElementChange } from '../inspector/element/write'
import type { BoardPoint } from '../notes/pick'
import type { ElementKey, SelectionStore } from '../selection'

/** Marks the live element an in-place edit has open, for the overlay and the tests. */
export const EDITING = 'data-frameboard-editing'

/** A line break in a platform's two-character or old Mac form. */
const BREAKS = /\r\n|\r/g

/** The newlines a text ends on. */
const TRAILING_BREAKS = /\n+$/

/** Runs of white space a collapsing element shows as one space. */
const SPACES = /[\t\n\f\r ]+/g

/**
 * Sends the changes one edit makes to its element as one write and one undo
 * step, answering whether they were written.
 */
export type WriteText = (changes: readonly ElementChange[]) => Promise<boolean>

/** Whether an element's computed style shows a newline in its text as a space. */
function collapsesBreaks(element: HTMLElement, view: Window): boolean {
  const { whiteSpace } = view.getComputedStyle(element)
  return whiteSpace === 'normal' || whiteSpace === 'nowrap'
}

/**
 * Opens the text of the element `key` names for typing on the canvas, in its
 * live frame, with its text selected, so typing replaces it. Enter and
 * Shift+Enter add a line, and Esc or a blur writes the new text through
 * `write`. A paste is taken as plain text, its breaks kept.
 *
 * A break is a newline in the element's one text node, never a `<br>`, which
 * would end its text-only state. On an element whose style collapses
 * newlines, the edit opens on the text as the browser shows it, so the
 * newlines a file wraps its source with never become lines, and a text
 * holding a break goes out with `white-space: pre-line` beside it.
 *
 * A reload of the frame ends the edit with nothing sent, since its hash names
 * bytes the file no longer holds. Answers the function that cancels the
 * edit, or null when the frame does not show those bytes or the element
 * holds more than text or none, as the Text field's `textOnly` reads it, so
 * an empty box such as a placed shape never takes text.
 */
export function editTextInPlace(
  document: Document,
  key: ElementKey,
  write: WriteText,
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
  const source = element.textContent ?? ''
  const collapses = collapsesBreaks(element, view)
  const before = collapses ? source.replace(SPACES, ' ').trim() : source
  const whiteSpace = element.style.whiteSpace
  if (before !== source) element.textContent = before
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
  const restore = () => {
    element.textContent = source
    element.style.whiteSpace = whiteSpace
  }
  const cancel = () => {
    if (!open) return
    close()
    restore()
  }
  function commit() {
    if (!open) return
    close()
    // A break at the end draws nothing, so none is written.
    const value = (element.textContent ?? '')
      .replace(BREAKS, '\n')
      .replace(TRAILING_BREAKS, '')
    if (value === before) {
      restore()
      return
    }
    element.textContent = value
    const changes: ElementChange[] = [{ kind: 'text', value }]
    if (collapses && value.includes('\n')) {
      changes.push({
        kind: 'style',
        property: 'white-space',
        value: 'pre-line',
      })
    }
    void write(changes).then((written) => {
      // The frame reloads with a landed write, so only a refusal shows the old text.
      if (!written && element.isConnected) restore()
    })
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      insert('\n')
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      commit()
    }
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault()
    insert(
      (event.clipboardData?.getData('text/plain') ?? '').replace(BREAKS, '\n'),
    )
  }
  const insert = (text: string) => {
    const range = view.getSelection()?.getRangeAt(0)
    if (!range || !element.contains(range.commonAncestorContainer)) return
    // The break shows while typing, as the written style will show it.
    if (collapses && text.includes('\n')) element.style.whiteSpace = 'pre-line'
    // Written as the one text node, so the caret lands past the insert
    // rather than wherever merging split nodes would leave it.
    const offset = (node: Node, at: number) => {
      const before = document.createRange()
      before.selectNodeContents(element)
      before.setEnd(node, at)
      return before.toString().length
    }
    const start = offset(range.startContainer, range.startOffset)
    const end = offset(range.endContainer, range.endOffset)
    const value = element.textContent ?? ''
    const after = value.slice(end)
    // A last newline draws no line, so the caret would sit before it. One
    // more gives it a line to sit on, and the commit trims it.
    const placeholder = after === '' && text.endsWith('\n') ? '\n' : ''
    element.textContent = value.slice(0, start) + text + (after || placeholder)
    const caret = document.createRange()
    caret.setStart(element.firstChild ?? element, start + text.length)
    caret.collapse(true)
    view.getSelection()?.removeAllRanges()
    view.getSelection()?.addRange(caret)
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
  write: WriteText,
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
