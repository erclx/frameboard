import {
  EDITING,
  type FramePoint,
  type TextEditEnd,
} from '@/shared/frame-bridge/messages'

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

/** An open text edit, which the board ends or moves the caret of. */
export interface OpenTextEdit {
  /** Ends the edit with nothing written, the old text shown again. */
  cancel: () => void
  /** Moves the caret to a point in the text, answering false for a point outside it or an ended edit. */
  caretAt: (at: FramePoint) => boolean
}

/** Whether an element's computed style shows a newline in its text as a space. */
function collapsesBreaks(element: HTMLElement): boolean {
  const { whiteSpace } = getComputedStyle(element)
  return whiteSpace === 'normal' || whiteSpace === 'nowrap'
}

/**
 * Opens an element's text, or only the run at `at` beside child elements,
 * for typing. A break is a newline, never a `<br>`, a reload ends the edit
 * unwritten, and an element with no text opens only when `empty` asks.
 */
export function openTextEdit(
  found: Element,
  end: EndTextEdit,
  at?: FramePoint,
  empty = false,
): OpenTextEdit | null {
  if (!(found instanceof HTMLElement)) return null
  if (found.childElementCount > 0) {
    const run = at && runAt(found, at)
    return run ? openRunEdit(found, run, end) : null
  }
  const blank = (found.textContent ?? '').trim() === ''
  if (blank && !empty) return null
  const element: HTMLElement = found
  const source = element.textContent ?? ''
  const collapses = collapsesBreaks(element)
  const before = collapses ? source.replace(SPACES, ' ').trim() : source
  const whiteSpace = element.style.whiteSpace
  const minHeight = element.style.minHeight
  if (before !== source) element.textContent = before
  // An element with no text lays out no line, so the caret would draw none.
  if (blank) element.style.minHeight = '1lh'
  let open = true

  const close = () => {
    open = false
    if (blank) element.style.minHeight = minHeight
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

  const caretAt = ({ x, y }: FramePoint) => {
    const point = caretPointAt(x, y)
    if (!open || !point || !element.contains(point.node)) return false
    placeCaret(point.node, point.offset)
    return true
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
  return { cancel, caretAt }
}

/** The caret position under a frame point, or null where the browser names none. */
function caretPointAt(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const position = document.caretPositionFromPoint?.(x, y)
  if (position) return { node: position.offsetNode, offset: position.offset }
  // WebKit before caretPositionFromPoint names the point by a range.
  const range = document.caretRangeFromPoint?.(x, y)
  return range
    ? { node: range.startContainer, offset: range.startOffset }
    : null
}

/** Collapses the selection to one caret at the offset in the node. */
function placeCaret(node: Node, offset: number): void {
  const caret = document.createRange()
  caret.setStart(node, offset)
  caret.collapse(true)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(caret)
}

/** The text node of the element's own under a point, or null for a child's text, bare white space, or none. */
function runAt(element: HTMLElement, { x, y }: FramePoint): Text | null {
  const node = caretPointAt(x, y)?.node
  return node instanceof Text &&
    node.parentNode === element &&
    node.data.trim() !== ''
    ? node
    : null
}

/**
 * Opens one run of text beside child elements for typing. Each child is
 * shut to the caret and every input is spliced into the run by hand, so no
 * keystroke reaches a child or splits, merges, or removes the run.
 */
function openRunEdit(
  element: HTMLElement,
  node: Text,
  end: EndTextEdit,
): OpenTextEdit {
  const index = [...element.childNodes]
    .filter((child) => child instanceof Text)
    .indexOf(node)
  const source = node.data
  const collapses = collapsesBreaks(element)
  // Only runs of white space collapse, since an edge space beside a child shows.
  const before = collapses ? source.replace(SPACES, ' ') : source
  if (before !== source) node.data = before
  const children = [...element.children].map((child) => ({
    child,
    editable: child.getAttribute('contenteditable'),
  }))
  const nodes = [...element.childNodes]
  const texts = nodes.map((child) => (child instanceof Text ? child.data : ''))
  let open = true

  // A composition the browser would not cancel writes wherever the caret sat, so every node but the run goes back.
  const putBack = () => {
    for (const stray of [...element.childNodes]) {
      if (!nodes.includes(stray)) stray.remove()
    }
    for (let at = nodes.length - 1; at >= 0; at--) {
      const child = nodes[at]
      if (child !== node && child instanceof Text) child.data = texts[at] ?? ''
      const next = nodes[at + 1]
      if (child && child.parentNode !== element) {
        element.insertBefore(child, next?.parentNode === element ? next : null)
      }
    }
  }
  const close = () => {
    open = false
    putBack()
    element.removeAttribute('contenteditable')
    element.removeAttribute(EDITING)
    for (const { child, editable } of children) {
      if (editable === null) child.removeAttribute('contenteditable')
      else child.setAttribute('contenteditable', editable)
    }
    element.removeEventListener('keydown', keydown)
    element.removeEventListener('paste', paste)
    element.removeEventListener('beforeinput', beforeinput)
    element.removeEventListener('blur', commit)
    window.removeEventListener('pagehide', unload)
  }
  const restore = () => {
    node.data = source
  }
  const restoreShown = () => {
    if (node.isConnected) restore()
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
    const value = node.data.replace(BREAKS, '\n')
    if (value === before) {
      restore()
      end({ kind: 'closed' }, restoreShown)
      return
    }
    end(
      { kind: 'commit', text: value, breaks: false, run: index },
      restoreShown,
    )
  }
  // A break in a collapsing element would need pre-line, which would show every sibling run's source newlines.
  const typed = (text: string) =>
    collapses ? text.replace(SPACES, ' ') : text.replace(BREAKS, '\n')
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!collapses) splice(selected(), '\n')
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      commit()
    }
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault()
    splice(selected(), typed(event.clipboardData?.getData('text/plain') ?? ''))
  }
  function beforeinput(event: InputEvent) {
    // A composition the browser will not let go of edits the run natively, so splicing it too would type it twice.
    if (!event.cancelable) return
    event.preventDefault()
    const [range = selected()] = event.getTargetRanges()
    if (event.inputType.startsWith('delete')) splice(range, '')
    else if (event.inputType.startsWith('insert')) {
      splice(
        range,
        typed(event.data ?? event.dataTransfer?.getData('text/plain') ?? ''),
      )
    }
  }
  const selected = () => {
    const selection = getSelection()
    return selection && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : undefined
  }
  // A caret beside the run may name it from the element, so that edge counts as the run's.
  const offsetIn = (container: Node, offset: number): number | undefined => {
    if (container === node) return offset
    if (container !== element) return undefined
    const at = [...element.childNodes].indexOf(node)
    if (offset === at) return 0
    return offset === at + 1 ? node.length : undefined
  }
  // A range reaching past the run, into a child or another run, writes nothing.
  const splice = (range: AbstractRange | undefined, text: string) => {
    const start = range && offsetIn(range.startContainer, range.startOffset)
    const end = range && offsetIn(range.endContainer, range.endOffset)
    if (start === undefined || end === undefined) return
    node.replaceData(start, end - start, text)
    const caret = document.createRange()
    caret.setStart(node, start + text.length)
    caret.collapse(true)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(caret)
  }

  // A point on a child or another run names no offset in the run, so it moves nothing.
  const caretAt = ({ x, y }: FramePoint) => {
    const point = caretPointAt(x, y)
    const offset = point && offsetIn(point.node, point.offset)
    if (!open || offset === undefined || offset === null) return false
    placeCaret(node, offset)
    return true
  }

  for (const { child } of children)
    child.setAttribute('contenteditable', 'false')
  element.setAttribute('contenteditable', 'plaintext-only')
  element.setAttribute(EDITING, '')
  element.addEventListener('keydown', keydown)
  element.addEventListener('paste', paste)
  element.addEventListener('beforeinput', beforeinput)
  element.addEventListener('blur', commit)
  window.addEventListener('pagehide', unload)
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return { cancel, caretAt }
}
