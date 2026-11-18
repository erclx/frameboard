import { EDITING, type TextEditEnd } from '@/shared/frame-bridge'

/** A line break in a platform's two-character or old Mac form. */
const BREAKS = /\r\n|\r/g

/** The newlines a text ends on. */
const TRAILING_BREAKS = /\n+$/

/** Runs of white space a collapsing element shows as one space. */
const SPACES = /[\t\n\f\r ]+/g

/**
 * Hears how an edit ends. A commit carries `restore`, which shows the old
 * text again should the board's write be refused.
 */
export type EndTextEdit = (end: TextEditEnd, restore: () => void) => void

/** Whether an element's computed style shows a newline in its text as a space. */
function collapsesBreaks(element: HTMLElement): boolean {
  const { whiteSpace } = getComputedStyle(element)
  return whiteSpace === 'normal' || whiteSpace === 'nowrap'
}

/**
 * Opens an element's text for typing in place, answering how to cancel it,
 * or null for an element holding anything but text. A break is a newline in
 * its one text node, never a `<br>`, which would end its text-only state, and
 * a reload ends the edit with nothing to write.
 */
export function openTextEdit(
  found: Element,
  end: EndTextEdit,
): (() => void) | null {
  if (
    !(found instanceof HTMLElement) ||
    found.childElementCount > 0 ||
    (found.textContent ?? '').trim() === ''
  ) {
    return null
  }
  const element: HTMLElement = found
  const source = element.textContent ?? ''
  const collapses = collapsesBreaks(element)
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
    window.removeEventListener('pagehide', unload)
  }
  const restore = () => {
    element.textContent = source
    element.style.whiteSpace = whiteSpace
  }
  // The frame reloads with a landed write, so only a refusal shows the old text.
  const restoreShown = () => {
    if (element.isConnected) restore()
  }
  const cancel = () => {
    if (!open) return
    close()
    restore()
  }
  function unload() {
    close()
    end({ kind: 'closed' }, restoreShown)
  }
  function commit() {
    if (!open) return
    close()
    // A break at the end draws nothing, so none is written.
    const value = (element.textContent ?? '')
      .replace(BREAKS, '\n')
      .replace(TRAILING_BREAKS, '')
    // A source ending on a break reads unchanged once trimmed, so it writes nothing.
    if (value === before.replace(TRAILING_BREAKS, '')) {
      restore()
      end({ kind: 'closed' }, restoreShown)
      return
    }
    element.textContent = value
    end(
      {
        kind: 'commit',
        text: value,
        breaks: collapses && value.includes('\n'),
      },
      restoreShown,
    )
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
    const range = getSelection()?.getRangeAt(0)
    if (!range || !element.contains(range.commonAncestorContainer)) return
    // The break shows while typing, as the written style will show it.
    if (collapses && text.includes('\n')) element.style.whiteSpace = 'pre-line'
    // One text node, so the caret lands past the insert rather than at a split.
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
    // A last newline draws no line, so a placeholder gives the caret one to trim later.
    const placeholder = after === '' && text.endsWith('\n') ? '\n' : ''
    element.textContent = value.slice(0, start) + text + (after || placeholder)
    const caret = document.createRange()
    caret.setStart(element.firstChild ?? element, start + text.length)
    caret.collapse(true)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(caret)
  }

  element.setAttribute('contenteditable', 'plaintext-only')
  element.setAttribute(EDITING, '')
  element.addEventListener('keydown', keydown)
  element.addEventListener('paste', paste)
  element.addEventListener('blur', commit)
  window.addEventListener('pagehide', unload)
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return cancel
}
